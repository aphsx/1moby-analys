"""End-to-end training run orchestrator (TRAINING-PIPELINE §2).

One call = one row in `ml_training_runs` driven to completed/failed:
gates → labels/features → split → baselines + candidates (Optuna) →
calibration → evaluation → leakage suite → multi-cutoff backtest →
promotion gate → artifacts + registry + production alias.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

import numpy as np
import pandas as pd

from src.constants import FEATURE_SET_CHURN_CLV, FEATURE_SET_CREDIT, RANDOM_SEED, RunStatus
from src.db import TRAINING_RUNS, from_json, load_run, update_run
from src.training import promotion
from src.training import repository
from src.training.artifacts import save_artifacts, verify_artifact_load
from src.training.baselines import (
    CHURN_BASELINE_NAMES,
    CLV_BASELINE_NAMES,
    CREDIT_BASELINE_NAMES,
)
from src.training.churn_trainer import (
    _resolve_candidates,
    finalize_churn_candidate,
    refit_for_backtest,
    train_churn_candidates,
)
from src.training.clv_trainer import CLV_CHAMPION, backtest_clv, train_clv
from src.training.credit_trainer import backtest_credit, train_credit
from src.training.data import TRAIN_TABLES, load_clean_dataset
from src.training.drift import build_feature_baseline
from src.training.datasets import (
    BACKTEST_STEP_MONTHS,
    MAX_BACKTESTS,
    MIN_BACKTEST_HISTORY_DAYS,
    CutoffDatasets,
    build_training_datasets,
    month_start,
    pool_train_rows,
)
from src.training.features import build_feature_set_contract
from src.training.labels import LabelConfig
from src.training.leakage import run_leakage_suite, run_regression_leakage_suite
from src.training.metrics import churn_metrics, round_metrics
from src.training.preprocessing import fit_preprocessor
from src.training.registry import (
    current_champion,
    insert_evaluation,
    insert_model_version,
    next_version,
    promote_model_version,
)
from src.training.validation import (
    ValidationCheck,
    ValidationReport,
    check_train_cutoff_feasibility,
    check_train_feature_leakage,
    check_train_label_viability,
    check_train_schema_quality,
    check_train_source_readiness,
)

logger = logging.getLogger(__name__)

ECE_LIMIT = 0.05
# Two-stage churn promotion (promotion.py). Ranking (PR-AUC) is the primary
# objective; calibration is a guardrail — a loose SAFETY ceiling (egregious
# miscalibration is rejected) plus a soft penalty above the desired target, NOT
# a hairline veto. So the best-ranking, recalibrated candidate wins instead of
# being knocked out by a noise-sized ECE miss.
# champion_margin_rel: a challenger must beat the incumbent on the aggregate
# backtest by ≥1% relative (churn/CLV) before it may take over production. A
# smaller gap is treated as a tie-on-noise and the incumbent is kept, so the
# champion does not rotate on sampling jitter (retrain-to-retrain stability).
CHURN_PROMOTION_CONFIG = promotion.PromotionConfig(
    primary_metric="pr_auc",
    higher_is_better=True,
    champion_margin=0.0,
    champion_margin_rel=0.01,
    stability_max_rel_drop=0.30,
    calibration_ceiling=0.10,
    calibration_target=ECE_LIMIT,
    calibration_penalty=1.0,
)
CLV_PROMOTION_CONFIG = promotion.PromotionConfig(
    primary_metric="clv_composite",
    higher_is_better=True,
    champion_margin=0.0,
    champion_margin_rel=0.01,
    stability_max_rel_drop=0.30,
    calibration_ceiling=0.10,
    calibration_target=0.05,
    calibration_penalty=0.5,
)
# Coverage must be in (0.75, 0.90]. calibration_error = max(0, coverage − 0.90):
#   if coverage ≤ 0.90 → calibration_error = 0.0 → passes the safety ceiling
#   if coverage > 0.90 → calibration_error > 0 > CEILING (0.001) → rejected
# The lower bound (0.75) is enforced via baseline_validation in CandidateEval.
CREDIT_PROMOTION_CONFIG = promotion.PromotionConfig(
    primary_metric="coverage_p10_p90",
    higher_is_better=True,
    champion_margin=0.0,
    # Coverage already lives in a tight band (0.75–0.90), so a smaller relative
    # floor is enough to reject noise-sized coverage wins.
    champion_margin_rel=0.005,
    stability_max_rel_drop=0.25,
    calibration_ceiling=0.001,
    calibration_target=None,
    calibration_penalty=0.0,
)
COVERAGE_RANGE = (0.75, 0.90)
BACKTEST_COVERAGE_RANGE = (0.70, 0.92)
CREDIT_MAE_TOLERANCE = 1.10


def run_training(training_run_id: str) -> None:
    """Execute one full training run; never leaves the row `in_progress`."""

    try:
        _run_training_inner(training_run_id)
    except Exception as exc:  # noqa: BLE001 - §2: every failure ends at status=failed.
        logger.exception("training run %s failed", training_run_id)
        update_run(
            TRAINING_RUNS,
            training_run_id,
            status=RunStatus.FAILED,
            error_message=f"{type(exc).__name__}: {exc}",
            progress={"phase": "failed", "pct": 100},
            mark_finished=True,
        )
        raise


def _run_training_inner(training_run_id: str) -> None:
    run = load_run(
        TRAINING_RUNS,
        training_run_id,
        "id::text, source_id::text, status, cutoff_date, horizon_days, created_by, training_config_json",
    )
    source_id = run["source_id"]
    cutoff = pd.Timestamp(run["cutoff_date"])
    if cutoff != month_start(cutoff):
        raise ValueError(
            f"cutoff_date {cutoff.date()} ไม่ตรงต้นเดือน — usage มี granularity รายเดือน "
            "cutoff กลางเดือนทำให้ feature เห็น usage หลัง cutoff (leak) — "
            "ใช้ suggested cutoff จาก API หรือ snap เป็นวันที่ 1 ของเดือน"
        )
    horizon_days = int(run["horizon_days"])
    created_by = run.get("created_by")
    label_config = LabelConfig(cutoff_date=cutoff, horizon_days=horizon_days)

    def progress(phase: str, pct: int) -> None:
        logger.info(f"[progress] {pct:3d}% {phase}")
        update_run(TRAINING_RUNS, training_run_id, progress={"phase": phase, "pct": pct})

    update_run(
        TRAINING_RUNS,
        training_run_id,
        status=RunStatus.IN_PROGRESS,
        mark_started=True,
        training_config={
            "cutoff_date": str(cutoff.date()),
            "horizon_days": horizon_days,
            "seed": RANDOM_SEED,
            "backtest_step_months": BACKTEST_STEP_MONTHS,
            "max_backtests": MAX_BACKTESTS,
        },
    )
    progress("gates", 3)

    # ── Gates 1–5 (§2 steps 3–5) ──────────────────────────────────
    # The train data is read once: the gates and the training datasets share it.
    clean = load_clean_dataset(source_id=source_id, tables=TRAIN_TABLES)
    gate_reports = [
        check_train_source_readiness(source_id),
        check_train_schema_quality(source_id, clean),
        check_train_cutoff_feasibility(source_id, label_config, clean),
        check_train_label_viability(source_id, label_config, clean),
        check_train_feature_leakage(source_id, cutoff, clean),
    ]
    for report in gate_reports:
        repository.save_validation_report(report, training_run_id=training_run_id)
    failed_gates = [r for r in gate_reports if r.status == "failed"]
    if failed_gates:
        names = ", ".join(f"{r.validation_type}" for r in failed_gates)
        raise RuntimeError(f"Quality gates failed: {names}")
    logger.info(f"Gates 1–5 passed ({len(gate_reports)} reports)")

    # ── Data + datasets (§2 steps 2, 6–7) ─────────────────────────
    progress("features", 8)
    customers, payments, usage = clean.customers, clean.payments, clean.usage
    td = build_training_datasets(customers, payments, usage, cutoff, horizon_days, progress)
    datasets_c1, backtest_sets = td.primary, td.backtests
    datasets_credit, credit_backtest_sets, credit_cutoff = td.credit, td.credit_backtests, td.credit_cutoff
    activity_min, activity_max = td.activity_min, td.activity_max

    update_run(
        TRAINING_RUNS,
        training_run_id,
        training_config={
            "cutoff_date": str(cutoff.date()),
            "horizon_days": horizon_days,
            "seed": RANDOM_SEED,
            "backtest_step_months": BACKTEST_STEP_MONTHS,
            "max_backtests": MAX_BACKTESTS,
            "min_backtest_history_days": MIN_BACKTEST_HISTORY_DAYS,
            "activity_range": [str(activity_min.date()), str(activity_max.date())],
            "backtest_cutoffs": [str(b.cutoff_date.date()) for b in backtest_sets],
            "credit_cutoff_date": str(credit_cutoff.date()),
            "credit_backtest_cutoffs": [str(b.cutoff_date.date()) for b in credit_backtest_sets],
            "churn_candidates": _resolve_candidates(None),
        },
    )

    results: list[dict[str, Any]] = []

    # ── Churn ─────────────────────────────────────────────────────
    results.append(
        _train_and_register_churn(
            training_run_id, source_id, datasets_c1, backtest_sets, horizon_days, created_by, progress
        )
    )

    # ── CLV ───────────────────────────────────────────────────────
    results.append(
        _train_and_register_clv(
            training_run_id, source_id, datasets_c1, backtest_sets, payments, horizon_days, created_by, progress
        )
    )

    # ── Credit ────────────────────────────────────────────────────
    results.append(
        _train_and_register_credit(
            training_run_id, source_id, datasets_credit, credit_backtest_sets, horizon_days, created_by, progress
        )
    )

    progress("completed", 100)
    update_run(
        TRAINING_RUNS,
        training_run_id,
        status=RunStatus.COMPLETED,
        results=results,
        mark_finished=True,
    )
    logger.info("Training run completed.")


# ── Churn ────────────────────────────────────────────────────────


def _train_and_register_churn(
    training_run_id: str,
    source_id: str,
    datasets: CutoffDatasets,
    backtest_sets: list[CutoffDatasets],
    horizon_days: int,
    created_by: str | None,
    progress: Callable[[str, int], None],
) -> dict[str, Any]:
    progress("churn: baselines + candidates (Optuna)", 15)
    # Multi-cutoff pooling: older-cutoff rows join the TRAIN split only (val/test
    # stay at the latest cutoff via pool_train_rows, which also drops held-out
    # acc_ids so no split contamination is possible). At ~1.5–2k active-paid rows
    # per cutoff this is the biggest lever on churn model quality. Churn uses
    # frame features+labels directly (no per-cutoff refit inside the trainer), so
    # pooling is leakage-safe — the same protocol already used for credit.
    dataset = pool_train_rows(datasets.churn, [bt.churn for bt in backtest_sets])
    logger.info(
        f"churn: pooled train rows {int((dataset.frame['split'] == 'train').sum())} "
        f"from {1 + len(backtest_sets)} cutoffs"
    )
    preprocessor = fit_preprocessor(
        dataset.features("train"), _feature_schema_for_dataset(datasets, dataset)
    )
    training = train_churn_candidates(dataset, preprocessor, progress=logger.info, candidates=None)

    # ── Evaluate EVERY candidate, then apply the two-stage promotion policy ──
    # (promotion.py) §8: Stage 1 safety gates decide eligibility (leakage,
    # beats trivial baselines, beats incumbent on aggregate, stability,
    # calibration safety ceiling); Stage 2 picks the best ELIGIBLE candidate by
    # a ranking-first composite. No early break — the champion is the best model
    # on quality, not the first that squeaks past a hairline threshold.
    progress("churn: evaluate candidates + promotion policy", 35)
    incumbent_backtests = _incumbent_backtests_by_metric("churn", "pr_auc")
    incumbent_primary_test = _incumbent_primary_test("churn", "pr_auc")
    attempts: list[dict[str, Any]] = []
    n_candidates = len(training.candidates)
    n_backtests = len(backtest_sets)
    candidate_span = 12 / max(n_candidates, 1)
    for attempt_index, candidate in enumerate(training.candidates):
        base_pct = 35 + attempt_index * candidate_span
        progress(
            f"churn: {candidate.name} finalize ({attempt_index + 1}/{n_candidates})",
            int(base_pct),
        )
        logger.info(f"churn: evaluating candidate {candidate.name} (#{attempt_index + 1})")
        result = finalize_churn_candidate(training, candidate, progress=logger.info)
        progress(
            f"churn: {candidate.name} leakage suite",
            int(base_pct + candidate_span * 0.35),
        )
        leakage = run_leakage_suite(
            dataset, preprocessor, candidate, result.validation_metrics["roc_auc"]
        )
        backtest_rows: list[dict[str, Any]] = []
        for bt_idx, bt in enumerate(backtest_sets):
            progress(
                f"churn: {candidate.name} backtest {bt.cutoff_date.date()} "
                f"({bt_idx + 1}/{n_backtests})",
                int(base_pct + candidate_span * (0.35 + 0.65 * (bt_idx + 1) / max(n_backtests, 1))),
            )
            bt_preproc = fit_preprocessor(
                bt.churn.features("train"), _feature_schema_for_dataset(bt, bt.churn)
            )
            y_test, probs, raw_scores, high_thr = refit_for_backtest(candidate, bt.churn, bt_preproc)
            backtest_rows.append(
                {
                    "cutoff_date": str(bt.cutoff_date.date()),
                    "metrics": round_metrics(
                        churn_metrics(y_test, probs, threshold=high_thr, ranking_scores=raw_scores)
                    ),
                    "baselines": _churn_backtest_baselines(bt, bt_preproc, high_thr),
                }
            )
        attempts.append(
            {
                "candidate": candidate,
                "result": result,
                "leakage": leakage,
                "backtest_rows": backtest_rows,
            }
        )

    by_name = {a["candidate"].name: a for a in attempts}
    decision = promotion.decide(
        [_churn_candidate_eval(a, incumbent_backtests, incumbent_primary_test) for a in attempts],
        CHURN_PROMOTION_CONFIG,
    )

    selection_log = [
        {
            "candidate": d.name,
            "cv_pr_auc": training.competition[d.name],
            "test_pr_auc": by_name[d.name]["result"].test_metrics["pr_auc"],
            "ece": by_name[d.name]["result"].test_metrics["ece"],
            "eligible": d.eligible,
            "composite": round(d.composite, 4),
            # gate_passed = passed the safety gate (eligible). The champion is the
            # best eligible candidate (is_champion); both surface on the web.
            "gate_passed": d.eligible,
            "is_champion": d.name == decision.winner,
            "reason": (
                "🏆 champion — " + decision.summary
                if d.name == decision.winner
                else ("ผ่าน safety gate (แต่ไม่ใช่ตัวที่ดีที่สุด)" if d.eligible else "ไม่ผ่าน: " + "; ".join(d.reasons))
            ),
        }
        for d in decision.candidates
    ]
    for entry in selection_log:
        logger.info(f"churn: {entry['candidate']} eligible={entry['eligible']} champion={entry['is_champion']} — {entry['reason']}")

    # Serve the safety/quality winner. Opaque champions such as TabICL are valid
    # predictors; prediction emits probabilities normally and leaves per-row
    # churn_factors null when SHAP is not available.
    if decision.winner is not None:
        selected = by_name[decision.winner]
    else:
        best = max(decision.candidates, key=lambda d: d.composite)
        selected = by_name[best.name]

    result = selected["result"]
    leakage = selected["leakage"]
    backtest_rows = selected["backtest_rows"]
    _save_leakage_report(
        training_run_id, source_id, datasets.cutoff_date, "churn",
        int(len(dataset.frame)), leakage,
    )

    progress("churn: artifacts + registry", 48)
    # Headline baseline = best baseline of a DIFFERENT algorithm. When the
    # champion is the LR candidate, comparing it against the LR baseline reads
    # as "model loses to baseline" when they are the same model class.
    comparable = [
        name for name in CHURN_BASELINE_NAMES if name != result.champion.name
    ] or CHURN_BASELINE_NAMES
    baseline_best_test = max(
        result.baseline_metrics[name]["test"]["pr_auc"] for name in comparable
    )
    baseline_best_name = max(
        comparable, key=lambda name: result.baseline_metrics[name]["test"]["pr_auc"]
    )

    version, feature_contract, feature_set_id = _new_version("churn", datasets, FEATURE_SET_CHURN_CLV, dataset.feature_names)

    model_card = {
        "model_type": "churn",
        "version": version,
        "method": "LightGBM + calibration + SHAP" if result.champion.name == "lightgbm" else result.champion.name,
        "algorithm": result.champion.name,
        "cutoff_date": str(datasets.cutoff_date.date()),
        "horizon_days": horizon_days,
        "dataset_rows": int(len(dataset.frame)),
        "positive_rate": result.test_metrics["positive_rate"],
        "feature_set": f"{feature_contract.name}/{feature_contract.version}",
        "feature_code_hash": feature_contract.feature_code_hash,
        "params": _plain(result.champion.params),
        "candidate_competition_cv_pr_auc": result.competition,
        "candidate_selection": selection_log,
        "calibration_method": result.calibrator.method,
        "calibration_ece_test": result.test_metrics["ece"],
        "thresholds": result.thresholds,
        "primary_metric": {
            "name": "PR-AUC",
            "value": result.test_metrics["pr_auc"],
            "baseline": baseline_best_test,
            "baseline_name": baseline_best_name,
        },
        "backtests": backtest_rows,
        "leakage": leakage,
        "limitations": "ใช้ได้กับลูกค้า Active Paid เท่านั้น (กลุ่มอื่น not eligible ตาม contract)",
        "trained_by": created_by,
    }

    # Flatten bootstrap CIs for key metrics into the test metrics dict so they
    # are persisted without a schema change. Full CI dict lives in test_ci_json.
    test_metrics_persisted = _flatten_ci(
        result.test_metrics, result.test_ci_json, ("pr_auc", "roc_auc", "brier", "bss", "log_loss")
    )
    # Extend calibration JSON with Hosmer-Lemeshow result (no schema change needed).
    calibration_persisted = {
        **result.calibration_json,
        **({"hosmer_lemeshow": result.hosmer_lemeshow_json} if result.hosmer_lemeshow_json else {}),
    }
    promote, reason = _register_and_promote(
        model_type="churn",
        version=version,
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        datasets=datasets,
        dataset=dataset,
        preprocessor=preprocessor,
        model_object=result.champion.model,
        model_card=model_card,
        result=result,
        backtest_rows=backtest_rows,
        horizon_days=horizon_days,
        artifact_extras={"calibrator": result.calibrator, "thresholds": result.thresholds},
        label_definition={
            "label": "churned = no payment and no positive usage in horizon",
            "population": "Active Paid at cutoff",
            "horizon_days": horizon_days,
        },
        snapshot_extra={"positive_rate": result.test_metrics["positive_rate"]},
        test_metrics_persisted=test_metrics_persisted,
        test_details={
            "confusion_matrix": result.confusion_json,
            "calibration": calibration_persisted,
            "lift_table": result.lift_table_json,
            "feature_importance": result.feature_importance,
        },
        backtest_horizon_days=horizon_days,
        winner=decision.winner,
        summary=decision.summary,
        created_by=created_by,
    )

    return {
        "model_type": "churn",
        "primary_metric_name": "PR-AUC",
        "primary_metric_value": result.test_metrics["pr_auc"],
        "baseline_name": baseline_best_name,
        "baseline_value": baseline_best_test,
        "calibration_ece": result.test_metrics["ece"],
        "leakage_passed": bool(leakage["passed"]),
        "promoted": promote,
        "promote_reason": reason,
        "new_version": version if promote else None,
    }


def _incumbent_backtests_by_metric(model_type: str, metric_key: str) -> dict[str, float] | None:
    """Per-cutoff backtest metric for the current champion, keyed by cutoff date string.

    Churn reads pr_auc, CLV spearman, credit coverage_p10_p90.
    """
    champion = current_champion(model_type)
    if champion is None:
        return None
    card = from_json(champion.get("model_card_json") or {})
    rows = card.get("backtests", []) or []
    out = {
        row["cutoff_date"]: row["metrics"][metric_key]
        for row in rows
        if isinstance(row.get("metrics"), dict) and metric_key in row["metrics"]
    }
    return out or None


def _incumbent_primary_test(model_type: str, metric_key: str) -> float | None:
    """Read the incumbent's holdout primary metric for fallback comparison."""
    champion = current_champion(model_type)
    if champion is None:
        return None
    metrics = champion.get("metrics_json") or {}
    metrics = from_json(metrics)
    value = metrics.get(metric_key) if isinstance(metrics, dict) else None
    return float(value) if isinstance(value, (int, float)) else None


def _churn_candidate_eval(
    attempt: dict[str, Any],
    incumbent_backtests: dict[str, float] | None,
    incumbent_primary_test: float | None,
) -> promotion.CandidateEval:
    """Build a promotion.CandidateEval from one finalized churn candidate.

    Baselines compared against EXCLUDE the same-named baseline (a candidate
    cannot be required to strictly beat itself — e.g. the logistic candidate vs
    the logistic baseline)."""

    candidate = attempt["candidate"]
    result = attempt["result"]
    backtest_rows = attempt["backtest_rows"]
    comparable = [name for name in CHURN_BASELINE_NAMES if name != candidate.name]

    def baseline_best(split: str) -> float:
        return max(result.baseline_metrics[name][split]["pr_auc"] for name in comparable)

    primary_backtests = {row["cutoff_date"]: row["metrics"]["pr_auc"] for row in backtest_rows}
    baseline_backtests = {
        row["cutoff_date"]: max(
            row["baselines"][name]["pr_auc"] for name in comparable if name in row["baselines"]
        )
        for row in backtest_rows
    }
    # Extract bootstrap CI on the primary (PR-AUC) test metric if available.
    test_ci: tuple[float, float] | None = None
    if result.test_ci_json and "pr_auc" in result.test_ci_json:
        ci = result.test_ci_json["pr_auc"]
        test_ci = (float(ci["ci_lower"]), float(ci["ci_upper"]))

    return promotion.CandidateEval(
        name=candidate.name,
        leakage_ok=bool(attempt["leakage"]["passed"]),
        artifact_ok=True,  # the winner's artifact is verified post-write
        primary_validation=result.validation_metrics["pr_auc"],
        primary_test=result.test_metrics["pr_auc"],
        baseline_validation=baseline_best("validation"),
        baseline_test=baseline_best("test"),
        primary_backtests=primary_backtests,
        baseline_backtests=baseline_backtests,
        champion_backtests=incumbent_backtests,
        incumbent_primary_test=incumbent_primary_test,
        calibration_error=result.test_metrics["ece"],
        primary_test_ci=test_ci,
    )


def _churn_backtest_baselines(
    bt: CutoffDatasets,
    preprocessor: Any,
    threshold: float,
) -> dict[str, dict[str, float]]:
    from src.training.baselines import (
        ChurnLogisticBaseline,
        churn_recency_rule_scores,
        churn_rfm_quartile_scores,
    )

    dataset = bt.churn
    y_train = np.asarray(dataset.labels("train", "churn_label"), dtype=int)
    y_test = np.asarray(dataset.labels("test", "churn_label"), dtype=int)
    test_features = dataset.features("test")
    logistic = ChurnLogisticBaseline(preprocessor).fit(dataset.features("train"), pd.Series(y_train))
    scores = {
        "recency_rule_90d": churn_recency_rule_scores(test_features),
        "rfm_quartile": churn_rfm_quartile_scores(test_features),
        "logistic_regression": logistic.predict_proba(test_features),
    }
    return {
        name: round_metrics(churn_metrics(y_test, score, threshold=threshold))
        for name, score in scores.items()
    }


# ── CLV ──────────────────────────────────────────────────────────


def _train_and_register_clv(
    training_run_id: str,
    source_id: str,
    datasets: CutoffDatasets,
    backtest_sets: list[CutoffDatasets],
    payments: pd.DataFrame,
    horizon_days: int,
    created_by: str | None,
    progress: Callable[[str, int], None],
) -> dict[str, Any]:
    progress("clv: two-part model + BG-NBD p_alive", 55)
    # Multi-cutoff pooling (train split only; val/test stay at the latest cutoff).
    # BG-NBD collapses duplicate acc_ids so pooling is at worst neutral for it
    # and never leaks (it fits RFM at the primary cutoff and never sees
    # post-cutoff labels).
    dataset = pool_train_rows(datasets.clv, [bt.clv for bt in backtest_sets])
    logger.info(
        f"clv: pooled train rows {int((dataset.frame['split'] == 'train').sum())} "
        f"from {1 + len(backtest_sets)} cutoffs"
    )
    preprocessor = fit_preprocessor(
        dataset.features("train"), _feature_schema_for_dataset(datasets, dataset)
    )
    result = train_clv(
        dataset, payments, datasets.cutoff_date, horizon_days, preprocessor,
        progress=logger.info,
    )

    progress("clv: backtests", 65)
    backtest_rows: list[dict[str, Any]] = []
    for bt in backtest_sets:
        bt_preproc = fit_preprocessor(
            bt.clv.features("train"), _feature_schema_for_dataset(bt, bt.clv)
        )
        champion_metrics, baseline_metrics = backtest_clv(bt.clv, bt_preproc)
        backtest_rows.append(
            {
                "cutoff_date": str(bt.cutoff_date.date()),
                "metrics": round_metrics(champion_metrics),
                "baselines": baseline_metrics,
            }
        )
        logger.info(f"clv backtest {bt.cutoff_date.date()}: composite {champion_metrics.get('clv_composite')}")

    progress("clv: leakage tests", 68)
    leakage = run_regression_leakage_suite(dataset, preprocessor, ["future_revenue_6m"])
    _save_leakage_report(
        training_run_id, source_id, datasets.cutoff_date, "clv",
        int(len(dataset.frame)), leakage,
    )
    logger.info(f"clv: leakage suite passed={leakage['passed']}")

    baseline_best_name = max(
        CLV_BASELINE_NAMES,
        key=lambda name: result.baseline_metrics[name]["test"]["clv_composite"],
    )
    baseline_best_test = result.baseline_metrics[baseline_best_name]["test"]["clv_composite"]

    # ── CLV promotion gate (two-stage; composite + p_pay ECE) ───────
    _clv_test_ci: tuple[float, float] | None = None
    if result.test_ci_json and "spearman" in result.test_ci_json:
        _ci = result.test_ci_json["spearman"]
        _clv_test_ci = (float(_ci["ci_lower"]), float(_ci["ci_upper"]))
    _clv_primary_backtests = {
        row["cutoff_date"]: row["metrics"]["clv_composite"] for row in backtest_rows
    }
    _clv_baseline_backtests = {
        row["cutoff_date"]: max(b["clv_composite"] for b in row["baselines"].values())
        for row in backtest_rows
    }
    _p_pay_ece = result.test_metrics.get("p_pay_ece")
    clv_eval = promotion.CandidateEval(
        name=CLV_CHAMPION,
        leakage_ok=bool(leakage["passed"]),
        artifact_ok=True,
        primary_validation=float(result.validation_metrics["clv_composite"]),
        primary_test=float(result.test_metrics["clv_composite"]),
        baseline_validation=max(
            result.baseline_metrics[n]["validation"]["clv_composite"] for n in CLV_BASELINE_NAMES
        ),
        baseline_test=max(
            result.baseline_metrics[n]["test"]["clv_composite"] for n in CLV_BASELINE_NAMES
        ),
        primary_backtests=_clv_primary_backtests,
        baseline_backtests=_clv_baseline_backtests,
        champion_backtests=_incumbent_backtests_by_metric("clv", "clv_composite"),
        incumbent_primary_test=_incumbent_primary_test("clv", "clv_composite"),
        calibration_error=float(_p_pay_ece) if _p_pay_ece is not None and not np.isnan(_p_pay_ece) else None,
        primary_test_ci=_clv_test_ci,
    )
    clv_decision = promotion.decide([clv_eval], CLV_PROMOTION_CONFIG)
    clv_selection_log = [
        {
            "candidate": CLV_CHAMPION,
            "internal_competition": {CLV_CHAMPION: result.validation_composite},
            "test_clv_composite": result.test_metrics["clv_composite"],
            "test_spearman": result.test_metrics["spearman"],
            "test_top_decile_capture": result.test_metrics["top_decile_capture"],
            "test_revenue_bias_ratio": result.test_metrics.get("revenue_bias_ratio"),
            "test_p_pay_roc_auc": result.test_metrics.get("p_pay_roc_auc"),
            "eligible": clv_decision.candidates[0].eligible,
            "composite": round(clv_decision.candidates[0].composite, 4),
            "is_champion": clv_decision.winner == CLV_CHAMPION,
            "reason": (
                "🏆 champion — " + clv_decision.summary
                if clv_decision.winner == CLV_CHAMPION
                else "ไม่ผ่าน: " + "; ".join(clv_decision.candidates[0].reasons)
            ),
        }
    ]
    for entry in clv_selection_log:
        logger.info(f"clv: {entry['candidate']} eligible={entry['eligible']} — {entry['reason']}")

    progress("clv: artifacts + registry", 70)
    version, feature_contract, feature_set_id = _new_version("clv", datasets, FEATURE_SET_CHURN_CLV, dataset.feature_names)

    model_card = {
        "model_type": "clv",
        "version": version,
        "method": "Two-part CLV (p_pay × value range) + BG-NBD p_alive",
        "algorithm": CLV_CHAMPION,
        "cutoff_date": str(datasets.cutoff_date.date()),
        "horizon_days": horizon_days,
        "dataset_rows": int(len(dataset.frame)),
        "feature_set": f"{feature_contract.name}/{feature_contract.version}",
        "feature_code_hash": feature_contract.feature_code_hash,
        "params": _plain(result.twopart_bundle.params if result.twopart_bundle else {}),
        "candidate_competition_val_composite": {CLV_CHAMPION: result.validation_composite},
        "candidate_selection": clv_selection_log,
        "primary_metric": {
            "name": "CLV composite",
            "value": result.test_metrics["clv_composite"],
            "baseline": max(
                result.baseline_metrics[n]["test"]["clv_composite"] for n in CLV_BASELINE_NAMES
            ),
            "baseline_name": baseline_best_name,
        },
        "component_metrics": {
            "spearman": result.test_metrics["spearman"],
            "top_decile_capture": result.test_metrics["top_decile_capture"],
            "revenue_bias_ratio": result.test_metrics.get("revenue_bias_ratio"),
            "range_coverage": result.test_metrics.get("range_coverage"),
            "p_pay_roc_auc": result.test_metrics.get("p_pay_roc_auc"),
            "p_pay_ece": result.test_metrics.get("p_pay_ece"),
        },
        "test_ci": result.test_ci_json,
        "backtests": backtest_rows,
        "p_alive_source": "bgnbd",
        "limitations": "CLV เป็น forecast 180 วัน — เทียบ value tier ข้าม run ตรง ๆ ไม่ได้",
        "trained_by": created_by,
    }

    model_object = {
        "kind": "clv_bundle",
        "champion": CLV_CHAMPION,
        "bgnbd": result.bgnbd,
        "twopart": result.twopart_bundle,
        "horizon_days": horizon_days,
        "magnitude_slope": result.magnitude_slope,
        "magnitude_intercept": result.magnitude_intercept,
    }
    promote, reason = _register_and_promote(
        model_type="clv",
        version=version,
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        datasets=datasets,
        dataset=dataset,
        preprocessor=preprocessor,
        model_object=model_object,
        model_card=model_card,
        result=result,
        backtest_rows=backtest_rows,
        horizon_days=horizon_days,
        artifact_extras={"thresholds": result.p_alive_thresholds or None},
        label_definition={
            "label": "future_revenue_6m = sum(amount) in horizon",
            "population": "Active at cutoff",
            "horizon_days": horizon_days,
        },
        snapshot_extra={},
        test_metrics_persisted=_flatten_ci(
            result.test_metrics, result.test_ci_json, ("spearman", "rmsle", "top_decile_capture")
        ),
        test_details={},
        backtest_horizon_days=horizon_days,
        winner=clv_decision.winner,
        summary=clv_decision.summary,
        created_by=created_by,
    )

    return {
        "model_type": "clv",
        "primary_metric_name": "CLV composite",
        "primary_metric_value": result.test_metrics["clv_composite"],
        "baseline_name": baseline_best_name,
        "baseline_value": baseline_best_test,
        "calibration_ece": None,
        "leakage_passed": bool(leakage["passed"]),
        "promoted": promote,
        "promote_reason": reason,
        "new_version": version if promote else None,
    }


# ── Credit ───────────────────────────────────────────────────────


def _train_and_register_credit(
    training_run_id: str,
    source_id: str,
    datasets: CutoffDatasets,
    backtest_sets: list[CutoffDatasets],
    horizon_days: int,
    created_by: str | None,
    progress: Callable[[str, int], None],
) -> dict[str, Any]:
    progress("credit: quantile models (Optuna)", 75)
    # Multi-cutoff pooling: older-cutoff rows join the train split (validation/
    # test stay at the latest cutoff) so the model sees the same customers in
    # different behavioural regimes instead of one static snapshot.
    dataset = pool_train_rows(datasets.credit, [bt.credit for bt in backtest_sets])
    logger.info(
        f"credit: pooled train rows {int((dataset.frame['split'] == 'train').sum())} "
        f"from {1 + len(backtest_sets)} cutoffs"
    )
    preprocessor = fit_preprocessor(
        dataset.features("train"), _feature_schema_for_dataset(datasets, dataset)
    )
    result = train_credit(
        dataset, preprocessor, topup_censor_days=float(horizon_days), progress=logger.info
    )

    progress("credit: backtests", 85)
    backtest_rows: list[dict[str, Any]] = []
    for bt in backtest_sets:
        older = [b.credit for b in backtest_sets if b.cutoff_date < bt.cutoff_date]
        bt_pooled = pool_train_rows(bt.credit, older)
        bt_preproc = fit_preprocessor(
            bt_pooled.features("train"), _feature_schema_for_dataset(bt, bt_pooled)
        )
        champion_metrics, baseline_metrics = backtest_credit(result, bt_pooled, bt_preproc)
        backtest_rows.append(
            {
                "cutoff_date": str(bt.cutoff_date.date()),
                "metrics": round_metrics(champion_metrics),
                "baselines": {k: v["test"] for k, v in baseline_metrics.items()},
            }
        )
        logger.info(f"credit backtest {bt.cutoff_date.date()}: coverage {champion_metrics['coverage_p10_p90']}")

    progress("credit: leakage tests", 88)
    leakage = run_regression_leakage_suite(
        dataset, preprocessor, ["future_credit_usage_30d", "future_credit_usage_90d"]
    )
    _save_leakage_report(
        training_run_id, source_id, datasets.cutoff_date, "credit",
        int(len(dataset.frame)), leakage,
    )
    logger.info(f"credit: leakage suite passed={leakage['passed']}")

    # Gate per TRAINING §11: credit PRIMARY metric is interval coverage.
    # Baselines are point forecasts with no interval → MAE comparison used as a
    # separate gate outside promotion.decide(). Coverage range (0.75, 0.90]:
    # lower bound enforced via baseline_validation in CandidateEval; upper bound
    # encoded as calibration_error = max(0, coverage − 0.90) with ceiling = 0.001.
    coverage = result.test_metrics["coverage_p10_p90"]
    best_baseline_mae30 = min(
        result.baseline_metrics[name]["test"]["mae_30d"] for name in CREDIT_BASELINE_NAMES
    )
    best_baseline_mae90 = min(
        result.baseline_metrics[name]["test"]["mae_90d"] for name in CREDIT_BASELINE_NAMES
    )
    beats_baselines = (
        result.test_metrics["mae_30d"] <= best_baseline_mae30 * CREDIT_MAE_TOLERANCE
        and result.test_metrics["mae_90d"] <= best_baseline_mae90 * CREDIT_MAE_TOLERANCE
    )

    # ── Credit promotion gate (two-stage safety/quality policy) ───
    _credit_test_ci: tuple[float, float] | None = None
    if result.test_ci_json and "coverage_p10_p90" in result.test_ci_json:
        _ci = result.test_ci_json["coverage_p10_p90"]
        _credit_test_ci = (float(_ci["ci_lower"]), float(_ci["ci_upper"]))
    _credit_primary_backtests = {
        row["cutoff_date"]: row["metrics"]["coverage_p10_p90"] for row in backtest_rows
    }
    _credit_baseline_backtests = {
        row["cutoff_date"]: BACKTEST_COVERAGE_RANGE[0] for row in backtest_rows
    }
    credit_eval = promotion.CandidateEval(
        name="quantile_champion",
        leakage_ok=bool(leakage["passed"]),
        artifact_ok=True,
        primary_validation=result.validation_metrics["coverage_p10_p90"],
        primary_test=coverage,
        baseline_validation=COVERAGE_RANGE[0],
        baseline_test=COVERAGE_RANGE[0],
        primary_backtests=_credit_primary_backtests,
        baseline_backtests=_credit_baseline_backtests,
        champion_backtests=_incumbent_backtests_by_metric("credit", "coverage_p10_p90"),
        incumbent_primary_test=_incumbent_primary_test("credit", "coverage_p10_p90"),
        calibration_error=max(0.0, coverage - COVERAGE_RANGE[1]),
        primary_test_ci=_credit_test_ci,
    )
    credit_decision = promotion.decide([credit_eval], CREDIT_PROMOTION_CONFIG)
    credit_selection_log = [
        {
            "candidate": "quantile_champion",
            "test_coverage": coverage,
            "eligible": credit_decision.candidates[0].eligible,
            "composite": round(credit_decision.candidates[0].composite, 4),
            "is_champion": credit_decision.winner is not None,
            "reason": (
                "🏆 champion — " + credit_decision.summary
                if credit_decision.winner is not None
                else "ไม่ผ่าน: " + "; ".join(credit_decision.candidates[0].reasons)
            ),
        }
    ]
    for entry in credit_selection_log:
        logger.info(f"credit: {entry['candidate']} eligible={entry['eligible']} — {entry['reason']}")

    progress("credit: artifacts + registry", 92)
    version, feature_contract, feature_set_id = _new_version("credit", datasets, FEATURE_SET_CREDIT, dataset.feature_names)

    baseline_best_name = min(
        CREDIT_BASELINE_NAMES, key=lambda name: result.baseline_metrics[name]["test"]["mae_30d"]
    )
    model_card = {
        "model_type": "credit",
        "version": version,
        "method": "LightGBM quantile regression (p10–p90, 30d/90d)",
        "algorithm": "lightgbm_quantile",
        "cutoff_date": str(datasets.cutoff_date.date()),
        "horizon_days": horizon_days,
        "dataset_rows": int(len(dataset.frame)),
        "feature_set": f"{feature_contract.name}/{feature_contract.version}",
        "feature_code_hash": feature_contract.feature_code_hash,
        "params": {str(h): _plain(p) for h, p in result.params_by_horizon.items()},
        "cqr_q_hat": {
            str(h): result.horizons[h].cqr_q_hat for h in result.horizons
        },
        "model_family": {
            str(h): result.horizons[h].model_family for h in result.horizons
        },
        "correction_shrinkage": {
            str(h): result.horizons[h].correction_shrinkage for h in result.horizons
        },
        "topup_model": (
            {
                "algorithm": "xgboost_aft",
                "distribution": result.topup_model.distribution,
                "scale": result.topup_model.scale,
                "censor_days": result.topup_model.censor_days,
                "day_scale": result.topup_model.day_scale,
                "urgent_day_threshold_raw": result.topup_model.urgent_day_threshold_raw,
                "urgent_topup_precision_test": result.test_metrics.get("urgent_topup_precision"),
                "urgent_topup_recall_test": result.test_metrics.get("urgent_topup_recall"),
                "topup_mae_days_observed_test": result.test_metrics.get("topup_mae_days_observed"),
            }
            if result.topup_model
            else None
        ),
        "pooled_cutoffs": [str(datasets.cutoff_date.date())]
        + [str(bt.cutoff_date.date()) for bt in backtest_sets],
        "candidate_selection": credit_selection_log,
        "primary_metric": {
            "name": "Coverage p10–p90",
            "value": coverage,
            # Point baselines have no interval — promotion floor is the coverage baseline.
            "baseline": COVERAGE_RANGE[0],
            "baseline_name": "target_75pct",
        },
        "test_ci": result.test_ci_json,
        "backtests": backtest_rows,
        "limitations": "ทำนายเฉพาะลูกค้าที่มีประวัติใช้งาน/จ่ายเงิน — ลูกค้า Ghost ไม่มี forecast",
        "trained_by": created_by,
    }

    model_object = {
        "kind": "credit_bundle",
        "horizons": result.horizons,
        "topup_model": result.topup_model,
    }
    promote, reason = _register_and_promote(
        model_type="credit",
        version=version,
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        datasets=datasets,
        dataset=dataset,
        preprocessor=preprocessor,
        model_object=model_object,
        model_card=model_card,
        result=result,
        backtest_rows=backtest_rows,
        horizon_days=horizon_days,
        artifact_extras={},
        label_definition={
            "label": "future_credit_usage_30d/90d = sum(usage) in horizon windows",
            "population": "customers with activity history",
        },
        snapshot_extra={},
        test_metrics_persisted=_flatten_ci(
            result.test_metrics,
            result.test_ci_json,
            ("coverage_p10_p90", "mae_30d", "mae_90d", "pinball_composite_30d", "pinball_composite_90d"),
        ),
        test_details={},
        backtest_horizon_days=None,
        winner=credit_decision.winner,
        summary=credit_decision.summary,
        created_by=created_by,
        extra_gate=(
            beats_baselines,
            f"ไม่ promote — MAE เกิน tolerance {CREDIT_MAE_TOLERANCE}× baseline (gate ข้อ 3)",
        ),
    )

    return {
        "model_type": "credit",
        "primary_metric_name": "Coverage p10–p90",
        "primary_metric_value": coverage,
        "baseline_name": "target_75pct",
        "baseline_value": COVERAGE_RANGE[0],
        "calibration_ece": None,
        "leakage_passed": bool(leakage["passed"]),
        "promoted": promote,
        "promote_reason": reason,
        "new_version": version if promote else None,
    }


# ── Shared tail: register a Model Version, persist its evaluations, promote ──


def _new_version(
    model_type: str, datasets: CutoffDatasets, feature_set: str, feature_names: list[str]
) -> tuple[str, Any, str]:
    """The next version number, its feature contract, and the saved contract's id."""
    version = next_version(model_type)
    feature_contract = build_feature_set_contract(
        datasets.feature_result,
        name=feature_set,
        version="v1",
        model_type=model_type,
        feature_names=feature_names,
    )
    return version, feature_contract, repository.save_feature_set_contract(feature_contract)


def _flatten_ci(
    test_metrics: dict[str, Any], test_ci_json: dict[str, Any] | None, keys: tuple[str, ...]
) -> dict[str, Any]:
    """Rounded test metrics plus `<key>_ci_lower` / `<key>_ci_upper` for each bootstrap CI."""
    persisted = dict(round_metrics(test_metrics))
    if test_ci_json:
        for key in keys:
            if key in test_ci_json:
                persisted[f"{key}_ci_lower"] = test_ci_json[key]["ci_lower"]
                persisted[f"{key}_ci_upper"] = test_ci_json[key]["ci_upper"]
    return persisted


def _persist_evaluations(
    *,
    version_id: str,
    training_run_id: str,
    model_type: str,
    cutoff_date: str,
    horizon_days: int,
    feature_set_id: str,
    validation_metrics: dict[str, Any],
    test_metrics_persisted: dict[str, Any],
    test_details: dict[str, Any],
    backtest_rows: list[dict[str, Any]],
    baseline_metrics: dict[str, dict[str, Any]],
    backtest_horizon_days: int | None,
) -> None:
    """Holdout (validation, test), backtest and baseline evaluation rows for one Model Version.

    `backtest_horizon_days` is written on the backtest and baseline rows; credit passes None
    because its backtests mix the 30- and 90-day horizons.
    """
    own = {"model_version_id": version_id, "training_run_id": training_run_id, "model_type": model_type}
    horizon = {} if backtest_horizon_days is None else {"horizon_days": backtest_horizon_days}
    insert_evaluation(
        **own, evaluation_type="holdout", dataset_split="validation",
        metrics=round_metrics(validation_metrics),
        cutoff_date=cutoff_date, horizon_days=horizon_days, feature_set_id=feature_set_id,
    )
    insert_evaluation(
        **own, evaluation_type="holdout", dataset_split="test",
        metrics=test_metrics_persisted,
        cutoff_date=cutoff_date, horizon_days=horizon_days, feature_set_id=feature_set_id,
        **test_details,
    )
    for row in backtest_rows:
        insert_evaluation(
            **own, evaluation_type="backtest", dataset_split="backtest",
            metrics=row["metrics"], cutoff_date=row["cutoff_date"], feature_set_id=feature_set_id, **horizon,
        )
        for baseline_name, metrics in row["baselines"].items():
            insert_evaluation(
                **own, evaluation_type="baseline", dataset_split="backtest",
                metrics=round_metrics(metrics), cutoff_date=row["cutoff_date"],
                baseline_name=baseline_name, **horizon,
            )
    for baseline_name, splits in baseline_metrics.items():
        for split_name, metrics in splits.items():
            insert_evaluation(
                **own, evaluation_type="baseline", dataset_split=split_name,
                metrics=round_metrics(metrics), cutoff_date=cutoff_date,
                baseline_name=baseline_name, **horizon,
            )


def _register_and_promote(
    *,
    model_type: str,
    version: str,
    training_run_id: str,
    feature_set_id: str,
    datasets: CutoffDatasets,
    dataset: Any,
    preprocessor: Any,
    model_object: Any,
    model_card: dict[str, Any],
    result: Any,
    backtest_rows: list[dict[str, Any]],
    horizon_days: int,
    artifact_extras: dict[str, Any],
    label_definition: dict[str, Any],
    snapshot_extra: dict[str, Any],
    test_metrics_persisted: dict[str, Any],
    test_details: dict[str, Any],
    backtest_horizon_days: int | None,
    winner: Any,
    summary: str,
    created_by: str | None,
    extra_gate: tuple[bool, str] = (True, ""),
) -> tuple[bool, str]:
    """Save the artifacts, insert the Model Version and its evaluations, then promote it when
    the policy picked a winner, `extra_gate` holds and the artifact reloads.

    Artifact load is the final safety gate, verified only for the chosen winner (losing
    candidates are not serialized): a winner whose artifact cannot reload is unsafe, so the
    incumbent stays. Returns (promoted, reason).
    """
    artifact_path, checksum = save_artifacts(
        model_type=model_type,
        version=version,
        model_object=model_object,
        preprocessor=preprocessor,
        feature_names=dataset.feature_names,
        metrics={
            "validation": result.validation_metrics,
            "test": result.test_metrics,
            "backtests": backtest_rows,
            "baselines": result.baseline_metrics,
        },
        model_card=model_card,
        feature_baseline=build_feature_baseline(
            dataset.features("train"), dataset.feature_names, datasets.cutoff_date
        ),
        **artifact_extras,
    )
    version_id = insert_model_version(
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        model_type=model_type,
        version=version,
        artifact_path=artifact_path,
        artifact_checksum=checksum,
        metrics=round_metrics(result.test_metrics),
        validation_metrics=round_metrics(result.validation_metrics),
        test_metrics=round_metrics(result.test_metrics),
        feature_names=dataset.feature_names,
        label_definition=label_definition,
        training_data_snapshot={
            "rows": int(len(dataset.frame)),
            "splits": {s: int((dataset.frame["split"] == s).sum()) for s in ("train", "validation", "test")},
            **snapshot_extra,
        },
        model_card=model_card,
    )
    _persist_evaluations(
        version_id=version_id,
        training_run_id=training_run_id,
        model_type=model_type,
        cutoff_date=str(datasets.cutoff_date.date()),
        horizon_days=horizon_days,
        feature_set_id=feature_set_id,
        validation_metrics=result.validation_metrics,
        test_metrics_persisted=test_metrics_persisted,
        test_details=test_details,
        backtest_rows=backtest_rows,
        baseline_metrics=result.baseline_metrics,
        backtest_horizon_days=backtest_horizon_days,
    )

    artifact_ok = verify_artifact_load(artifact_path, dataset.features("test").head(5))
    gate_ok, gate_reason = extra_gate
    promote = winner is not None and gate_ok and artifact_ok
    if winner is not None and not artifact_ok:
        reason = "ไม่ promote — artifact load test ไม่ผ่าน (safety gate)"
    elif winner is not None and not gate_ok:
        reason = gate_reason
    else:
        reason = summary
    if promote:
        promote_model_version(
            model_type=model_type, model_version_id=version_id, reason=reason, created_by=created_by
        )
    logger.info(f"{model_type}: promoted={promote} — {reason}")
    return promote, reason


# ── Shared helpers ───────────────────────────────────────────────


def _feature_schema_for_dataset(
    cutoff_datasets: CutoffDatasets,
    dataset: Any,
) -> dict[str, dict[str, Any]]:
    return {
        feature_name: cutoff_datasets.feature_result.feature_schema[feature_name]
        for feature_name in dataset.feature_names
    }


def _save_leakage_report(
    training_run_id: str,
    source_id: str,
    cutoff_date: pd.Timestamp,
    model_type: str,
    row_count: int,
    leakage: dict[str, Any],
) -> None:
    checks = [
        ValidationCheck(
            name=check["name"],
            severity="blocker" if check["severity"] == "fail" else "warning",
            passed=bool(check["passed"]),
            message=check["message"],
            details=check.get("details"),
        )
        for check in leakage["checks"]
    ]
    report = ValidationReport(
        source_id=source_id,
        source_kind="train",
        validation_type="leakage",
        status="passed" if leakage["passed"] else "failed",
        row_count=row_count,
        stats={"cutoff_date": str(cutoff_date.date()), "model_type": model_type},
        anomalies=[
            {"check": check["name"], "message": check["message"]}
            for check in leakage["checks"]
            if not check["passed"]
        ],
        checks=checks,
    )
    repository.save_validation_report(report, training_run_id=training_run_id)


def _plain(params: dict[str, Any]) -> dict[str, Any]:
    plain: dict[str, Any] = {}
    for key, value in params.items():
        if isinstance(value, (np.floating, np.integer)):
            plain[key] = value.item()
        elif isinstance(value, (str, int, float, bool)) or value is None:
            plain[key] = value
        else:
            plain[key] = str(value)
    return plain
