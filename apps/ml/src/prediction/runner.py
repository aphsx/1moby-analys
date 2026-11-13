"""Prediction run executor.

Loads `predict_clean_*`, runs the production champions (churn / clv / credit)
through the same feature contract used at training time, computes derived
business fields, and batch-inserts exactly one row per customer into
`ml_prediction_outputs`. Every failure ends with the run marked `failed`.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

from src.constants import LifecycleStage, RunStatus
from src.training import repository
from src.training.artifacts import load_artifacts
from src.training.data import load_predict_clean
from src.training.drift import compute_feature_drift, drift_anomalies, drift_report_status
from src.training.features import build_all_features
from src.training.preprocessing import transform_features
from src.training.registry import current_champion, version_for_serving
from src.training.validation import (
    ValidationReport,
    check_predict_feature_leakage,
    check_predict_schema_quality,
    check_predict_source_readiness,
)
from src.prediction.scoring import (
    apply_clv,
    apply_credit,
    churn_shap_factors,
    feature_contract_guard,
    features_for_bundle,
    risk_level,
)
from src.prediction.derived import apply_derived, apply_descriptive, load_p_alive_cuts
from src.prediction.persistence import (
    build_output_rows,
    delete_outputs,
    load_prediction_run,
    run_post_check,
    replace_outputs,
    save_postcheck_report,
    update_prediction_run,
)

logger = logging.getLogger(__name__)


# Eligibility column scored by each model — drift is measured on the population
# that is actually being predicted, not the whole upload.
_DRIFT_ELIGIBILITY = {"churn": "el_churn", "clv": "el_clv", "credit": "el_credit"}


def _run_drift_checks(
    prediction_run_id: str,
    source_id: str,
    champions: dict[str, dict[str, Any]],
    frame: pd.DataFrame,
) -> set[str]:
    """Score PSI drift per model and persist one drift report each.

    Returns the set of model_types with major drift (≥MAJOR_DRIFT_MIN_FEATURES
    features over the major PSI band). Major drift surfaces as
    output_status=PARTIAL for affected customers.
    Champions trained before drift monitoring shipped carry no baseline and
    are skipped (not counted as drifted).
    """

    major_drift_models: set[str] = set()
    for model_type, champion in champions.items():
        bundle = champion["bundle"]
        baseline = bundle.get("feature_baseline")
        if not baseline:
            logger.info(
                "drift: %s champion has no feature baseline — skipping", model_type
            )
            continue

        feature_names = list(bundle["preprocessor"].feature_names)
        mask = frame[_DRIFT_ELIGIBILITY[model_type]].to_numpy()
        scored = frame.loc[mask, feature_names]
        if scored.empty:
            logger.info(
                "drift: %s has no eligible rows to score — skipping", model_type
            )
            continue

        drift = compute_feature_drift(scored, baseline, model_type=model_type)
        status = drift_report_status(drift)
        if drift["overall_status"] != "stable":
            logger.warning(
                "drift: %s %s — %d minor / %d major drifted features (consider retraining)",
                model_type,
                drift["overall_status"],
                drift["minor_drift_count"],
                drift["major_drift_count"],
            )
        # PARTIAL only when the run is genuinely major-drifted (≥N major
        # features, see MAJOR_DRIFT_MIN_FEATURES) — not on a single noisy one.
        if drift["overall_status"] == "major_drift":
            major_drift_models.add(model_type)

        report = ValidationReport(
            source_id=source_id,
            source_kind="predict",
            validation_type="drift",
            status=status,
            row_count=int(len(scored)),
            stats={"model_type": model_type, "overall_status": drift["overall_status"]},
            anomalies=drift_anomalies(drift),
            checks=[],
            drift=drift,
        )
        repository.save_validation_report(report, prediction_run_id=prediction_run_id)

    return major_drift_models


def run_prediction(prediction_run_id: str) -> None:
    try:
        _run_prediction_inner(prediction_run_id)
    except Exception as exc:  # noqa: BLE001 - §6.8: never leave a run in_progress.
        logger.exception("prediction run %s failed", prediction_run_id)
        # Outputs may already be committed (the post-check runs after the insert); a failed
        # run must not leave rows that the outputs routes and the AI SQL agent would read.
        try:
            delete_outputs(prediction_run_id)
        except Exception:  # noqa: BLE001 - the run is still marked failed below.
            logger.exception("could not delete outputs of failed prediction run %s", prediction_run_id)
        update_prediction_run(
            prediction_run_id,
            status=RunStatus.FAILED,
            error_message=f"{type(exc).__name__}: {exc}",
            progress={"phase": "failed", "pct": 100},
            mark_finished=True,
        )
        raise


def _run_prediction_inner(prediction_run_id: str) -> None:
    run = load_prediction_run(prediction_run_id)
    source_id = run["predict_source_id"]
    cutoff = pd.Timestamp(run["cutoff_date"])

    def progress(phase: str, pct: int) -> None:
        logger.info("[%s] %d%% %s", prediction_run_id[:8], pct, phase)
        update_prediction_run(prediction_run_id, progress={"phase": phase, "pct": pct})

    update_prediction_run(prediction_run_id, status=RunStatus.IN_PROGRESS, mark_started=True)
    progress("load data", 5)

    # ── Models: production champion by default, or a per-run override ─────
    # `model_overrides_json` maps model_type → version_id. A missing/None entry
    # (or an invalid one) falls back to the production champion for that type.
    overrides = run.get("model_overrides_json") or {}
    if not isinstance(overrides, dict):
        overrides = {}
    champions: dict[str, dict[str, Any]] = {}
    for model_type in ("churn", "clv", "credit"):
        selected = None
        override_id = overrides.get(model_type)
        if override_id:
            selected = version_for_serving(model_type, str(override_id))
            if selected is None:
                raise RuntimeError(
                    f"Selected {model_type} model version {override_id} not found "
                    "or has no artifact — pick another version or use the champion."
                )
            logger.info("[%s] %s using override version %s", prediction_run_id[:8], model_type, selected["version"])
        else:
            selected = current_champion(model_type)
            if selected is None:
                raise RuntimeError(
                    f"No production model for '{model_type}' — train and promote first."
                )
        champions[model_type] = {
            **selected,
            "bundle": load_artifacts(selected["artifact_path"], selected["artifact_checksum"]),
        }

    # ── Gates on the predict source ───────────────────────────────
    progress("quality gates", 10)
    gate_reports = [
        check_predict_source_readiness(source_id),
        check_predict_schema_quality(source_id),
        check_predict_feature_leakage(source_id, cutoff),
    ]
    for report in gate_reports:
        repository.save_validation_report(report, prediction_run_id=prediction_run_id)
    failed = [r for r in gate_reports if r.status == "failed"]
    if failed:
        raise RuntimeError(
            "Predict source failed gates: "
            + ", ".join(r.validation_type for r in failed)
        )

    customers, payments, usage = load_predict_clean(source_id)

    progress("features", 20)
    feature_result = build_all_features(customers, payments, usage, cutoff)
    # lifecycle_df carries its own days_since_last_activity (same definition
    # as the feature) — drop it so the merge keeps the plain feature column.
    lifecycle_df = feature_result.lifecycle_df.drop(
        columns=["days_since_last_activity"]
    )
    frame = lifecycle_df.merge(feature_result.feature_df, on="acc_id", how="left")
    frame["acc_id"] = frame["acc_id"].astype(int)

    # Eligibility matrix per OUTPUT-CONTRACT §2 (overrides features.py flags
    # for Churned/Ghost on clv + credit).
    stage = frame["lifecycle_stage"]
    frame["el_churn"] = stage.eq(LifecycleStage.ACTIVE_PAID)
    frame["el_clv"] = stage.isin(list(LifecycleStage.ACTIVE))
    frame["el_credit"] = stage.isin(list(LifecycleStage.ACTIVE))

    for model_type, champion in champions.items():
        feature_contract_guard(model_type, champion["bundle"], frame)

    # ── Feature drift monitoring (PSI vs training baseline) ───────
    progress("drift monitoring", 30)
    major_drift_models = _run_drift_checks(
        prediction_run_id, source_id, champions, frame
    )

    # ── Churn (calibrated probability + SHAP factors) ─────────────
    progress("churn model", 35)
    churn_bundle = champions["churn"]["bundle"]
    churn_features = features_for_bundle(frame, churn_bundle)
    thresholds = churn_bundle.get("thresholds")
    if not thresholds:
        # Fail loud: a churn champion without its trained risk thresholds is a
        # broken artifact. Guessing with defaults would silently mislabel risk.
        raise RuntimeError(
            "Churn champion is missing risk thresholds (thresholds.json); "
            "refusing to guess — retrain/repromote the churn model."
        )
    churn_prob = np.full(len(frame), np.nan)
    churn_mask = frame["el_churn"].to_numpy()
    if churn_mask.any():
        x_churn = transform_features(
            churn_features[churn_mask], churn_bundle["preprocessor"]
        )
        raw_scores = churn_bundle["model"].predict_proba(x_churn)[:, 1]
        calibrator = churn_bundle["calibrator"]
        churn_prob[churn_mask] = (
            calibrator.transform(raw_scores) if calibrator is not None else raw_scores
        )
    frame["churn_probability"] = np.clip(churn_prob, 0.0, 1.0)
    frame["churn_risk_level"] = [
        risk_level(p, thresholds) for p in frame["churn_probability"]
    ]

    progress("churn explanations (SHAP)", 45)
    churn_factors, shap_error = churn_shap_factors(
        churn_bundle, churn_features, frame, churn_mask
    )
    frame["churn_factors"] = churn_factors
    # Shown on the run so a completed run with empty churn factors isn't a silent mystery.
    warnings = [f"Churn explanations unavailable: {shap_error}"] if shap_error else []

    # ── CLV + p_alive ─────────────────────────────────────────────
    progress("clv model", 55)
    clv_bundle = champions["clv"]["bundle"]
    clv_features = features_for_bundle(frame, clv_bundle)
    frame = apply_clv(frame, clv_bundle, clv_features, payments, cutoff)
    # p_alive health cuts travel with the CLV model (derived from its validation
    # distribution at training). Legacy artifacts have no thresholds → fall back
    # to the fixed constants.
    p_alive_cuts = load_p_alive_cuts(clv_bundle.get("thresholds"))

    # ── Credit quantiles ─────────────────────────────────────────
    progress("credit model", 65)
    credit_bundle = champions["credit"]["bundle"]
    credit_features = features_for_bundle(frame, credit_bundle)
    frame = apply_credit(frame, credit_bundle, credit_features)

    # ── Descriptive + profile snapshot (§3.3) ─────────────────────
    progress("derived fields", 75)
    frame = apply_descriptive(frame, customers, payments, cutoff)

    # ── Derived business fields (§5) ──────────────────────────────
    frame = apply_derived(frame, cutoff, p_alive_cuts)

    model_versions = {
        model_type: champions[model_type]["version"] for model_type in champions
    }

    # ── Batch insert (§6.6) ───────────────────────────────────────
    progress("insert outputs", 85)
    # Drop duplicates on acc_id — the unique constraint on (prediction_run_id, acc_id)
    # requires one row per customer. A fan-out from an upstream merge could in theory
    # produce duplicates; keep the last occurrence so the most-derived values win.
    frame = frame.drop_duplicates(subset=["acc_id"], keep="last")
    rows = build_output_rows(
        prediction_run_id, frame, model_versions, major_drift_models
    )
    replace_outputs(prediction_run_id, rows)

    # ── Gate 15 post-check (§6.7) ─────────────────────────────────
    progress("post-checks", 95)
    post_check = run_post_check(prediction_run_id, frame)
    save_postcheck_report(prediction_run_id, source_id, post_check)
    if not post_check["passed"]:
        raise RuntimeError(f"Output post-check failed: {post_check['failures']}")

    update_prediction_run(
        prediction_run_id,
        status=RunStatus.COMPLETED,
        error_message=None,
        total_customers=int(len(frame)),
        model_versions=model_versions,
        progress={"phase": "completed", "pct": 100, "warnings": warnings},
        mark_finished=True,
    )
    logger.info(
        "prediction run %s completed (%d customers)", prediction_run_id, len(frame)
    )
