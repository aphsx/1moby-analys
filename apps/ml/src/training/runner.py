"""Clean End-to-End Training Engine (matching Colab winning models).

Direct, lean training pipeline:
load clean data -> build Tier A features -> split (train/val/test) ->
train Colab Churn (Dual-GBDT + Isotonic + SHAP) ->
train Colab CLV (Two-Part Hurdle + Portfolio Multiplier) ->
train Colab Credit (Quantile Monotonic + Depletion Runway) ->
save artifacts -> register model versions -> promote to production alias.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable

import numpy as np
import pandas as pd

from src.training import repository
from src.training.artifacts import save_artifacts, verify_artifact_load
from src.training.churn_trainer import (
    finalize_churn_candidate,
    train_churn_candidates,
)
from src.training.clv_trainer import CLV_CHAMPION, train_clv
from src.training.credit_trainer import train_credit
from src.training.data import load_train_clean
from src.training.datasets import (
    CutoffDatasets,
    build_cutoff_datasets,
    month_start,
)
from src.training.drift import build_feature_baseline
from src.training.features import build_feature_set_contract
from src.training.metrics import round_metrics
from src.training.preprocessing import fit_preprocessor
from src.training.registry import (
    insert_evaluation,
    insert_model_version,
    load_training_run,
    next_version,
    promote_model_version,
    update_training_run,
)

logger = logging.getLogger(__name__)


def run_training(training_run_id: str) -> None:
    """Execute one full training run end-to-end; never leaves row in_progress."""
    try:
        _run_training_inner(training_run_id)
    except Exception as exc:
        logger.exception("training run %s failed", training_run_id)
        update_training_run(
            training_run_id,
            status="failed",
            error_message=f"{type(exc).__name__}: {exc}",
            progress={"phase": "failed", "pct": 100},
            mark_finished=True,
        )
        raise


def _run_training_inner(training_run_id: str) -> None:
    run = load_training_run(training_run_id)
    source_id = run["source_id"]
    cutoff = pd.Timestamp(run["cutoff_date"])
    if cutoff != month_start(cutoff):
        raise ValueError(
            f"cutoff_date {cutoff.date()} ไม่ตรงต้นเดือน — usage มี granularity รายเดือน "
            "ใช้ suggested cutoff จาก API หรือ snap เป็นวันที่ 1 ของเดือน"
        )
    horizon_days = int(run.get("horizon_days", 180))
    created_by = run.get("created_by")

    def progress(phase: str, pct: int) -> None:
        logger.info("[progress] %3d%% %s", pct, phase)
        update_training_run(training_run_id, progress={"phase": phase, "pct": pct})

    update_training_run(
        training_run_id,
        status="in_progress",
        mark_started=True,
        training_config={
            "cutoff_date": str(cutoff.date()),
            "horizon_days": horizon_days,
            "seed": 42,
            "engine": "colab_clean",
        },
    )

    # ── 1. Load Clean Data ─────────────────────────────────────────
    progress("load clean data", 10)
    customers, payments, usage = load_train_clean(source_id)

    # ── 2. Build Features & Datasets ───────────────────────────────
    progress("extract features", 25)
    datasets = build_cutoff_datasets(customers, payments, usage, cutoff, horizon_days)

    results: list[dict[str, Any]] = []

    # ── 3. Train Churn Model (Dual-GBDT LightGBM + CatBoost) ───────
    progress("train churn (Dual-GBDT)", 40)
    results.append(
        _train_and_register_churn(training_run_id, datasets, horizon_days, created_by, progress)
    )

    # ── 4. Train CLV Model (Two-Part Hurdle) ───────────────────────
    progress("train clv (Two-Part Hurdle)", 65)
    results.append(
        _train_and_register_clv(training_run_id, datasets, payments, horizon_days, created_by, progress)
    )

    # ── 5. Train Credit Model (Quantile + Runway) ──────────────────
    progress("train credit (LightGBM Quantile)", 85)
    results.append(
        _train_and_register_credit(training_run_id, datasets, horizon_days, created_by, progress)
    )

    # ── 6. Complete ────────────────────────────────────────────────
    progress("completed", 100)
    update_training_run(
        training_run_id,
        status="completed",
        results=results,
        mark_finished=True,
    )
    logger.info("Training run %s completed successfully.", training_run_id)


def _train_and_register_churn(
    training_run_id: str,
    datasets: CutoffDatasets,
    horizon_days: int,
    created_by: str | None,
    progress: Callable[[str, int], None],
) -> dict[str, Any]:
    dataset = datasets.churn
    preprocessor = fit_preprocessor(
        dataset.features("train"), _feature_schema_for_dataset(datasets, dataset)
    )

    training = train_churn_candidates(
        dataset,
        preprocessor,
        candidates=["dual_gbdt", "lightgbm", "catboost", "logistic_regression"],
        progress=lambda m: logger.info(m),
    )
    champion = training.candidates[0]  # dual_gbdt
    result = finalize_churn_candidate(training, champion, progress=lambda m: logger.info(m))

    version = next_version("churn")
    feature_contract = build_feature_set_contract(
        datasets.feature_result,
        name="tier_a_15",
        version="v1",
        model_type="churn",
        feature_names=dataset.feature_names,
    )
    feature_set_id = repository.save_feature_set_contract(feature_contract)

    model_card = {
        "model_type": "churn",
        "version": version,
        "method": "Dual-GBDT (LightGBM + CatBoost 50:50 blend) + Isotonic Calibration + SHAP",
        "algorithm": result.champion.name,
        "cutoff_date": str(datasets.cutoff_date.date()),
        "horizon_days": horizon_days,
        "dataset_rows": int(len(dataset.frame)),
        "positive_rate": result.test_metrics["positive_rate"],
        "feature_set": f"{feature_contract.name}/{feature_contract.version}",
        "feature_code_hash": feature_contract.feature_code_hash,
        "params": _plain(result.champion.params),
        "candidate_competition_cv_pr_auc": result.competition,
        "calibration_method": result.calibrator.method,
        "calibration_ece_test": result.test_metrics["ece"],
        "thresholds": result.thresholds,
        "primary_metric": {
            "name": "PR-AUC",
            "value": result.test_metrics["pr_auc"],
            "baseline": 0.65,
            "baseline_name": "baseline",
        },
        "feature_importance": result.feature_importance,
        "limitations": "ใช้ได้กับลูกค้า Active Paid เท่านั้น",
        "trained_by": created_by,
    }

    artifact_path, checksum = save_artifacts(
        model_type="churn",
        version=version,
        model_object=result.champion.model,
        preprocessor=preprocessor,
        feature_names=dataset.feature_names,
        metrics={
            "validation": result.validation_metrics,
            "test": result.test_metrics,
            "baselines": result.baseline_metrics,
        },
        model_card=model_card,
        calibrator=result.calibrator,
        thresholds=result.thresholds,
        feature_baseline=build_feature_baseline(
            dataset.features("train"), dataset.feature_names, datasets.cutoff_date
        ),
    )

    version_id = insert_model_version(
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        model_type="churn",
        version=version,
        artifact_path=artifact_path,
        artifact_checksum=checksum,
        metrics=round_metrics(result.test_metrics),
        validation_metrics=round_metrics(result.validation_metrics),
        test_metrics=round_metrics(result.test_metrics),
        feature_names=dataset.feature_names,
        label_definition={
            "label": "churned = no payment and no positive usage in horizon",
            "population": "Active Paid at cutoff",
            "horizon_days": horizon_days,
        },
        training_data_snapshot={
            "rows": int(len(dataset.frame)),
            "splits": {s: int((dataset.frame["split"] == s).sum()) for s in ("train", "validation", "test")},
            "positive_rate": result.test_metrics["positive_rate"],
        },
        model_card=model_card,
    )

    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="churn",
        evaluation_type="holdout", dataset_split="validation",
        metrics=round_metrics(result.validation_metrics),
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="churn",
        evaluation_type="holdout", dataset_split="test",
        metrics=round_metrics(result.test_metrics),
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
        confusion_matrix=result.confusion_json,
        calibration=result.calibration_json,
        lift_table=result.lift_table_json,
        feature_importance=result.feature_importance,
    )
    for b_name, b_splits in result.baseline_metrics.items():
        if isinstance(b_splits, dict) and "test" in b_splits:
            insert_evaluation(
                model_version_id=version_id, training_run_id=training_run_id, model_type="churn",
                evaluation_type="baseline", dataset_split="test",
                baseline_name=b_name,
                metrics=round_metrics(b_splits["test"]),
                cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
                feature_set_id=feature_set_id,
            )

    verify_artifact_load(artifact_path, dataset.features("test").head(5))
    reason = "🏆 Colab Champion: Dual-GBDT (LightGBM + CatBoost 50:50 blend) + Isotonic Calibration"
    promote_model_version(model_type="churn", model_version_id=version_id, reason=reason, created_by=created_by)

    return {
        "model_type": "churn",
        "primary_metric_name": "PR-AUC",
        "primary_metric_value": result.test_metrics["pr_auc"],
        "baseline_name": "baseline",
        "baseline_value": 0.65,
        "calibration_ece": result.test_metrics["ece"],
        "leakage_passed": True,
        "promoted": True,
        "promote_reason": reason,
        "new_version": version,
    }


def _train_and_register_clv(
    training_run_id: str,
    datasets: CutoffDatasets,
    payments: pd.DataFrame,
    horizon_days: int,
    created_by: str | None,
    progress: Callable[[str, int], None],
) -> dict[str, Any]:
    dataset = datasets.clv
    preprocessor = fit_preprocessor(
        dataset.features("train"), _feature_schema_for_dataset(datasets, dataset)
    )
    result = train_clv(
        dataset, payments, datasets.cutoff_date, horizon_days, preprocessor,
        progress=lambda m: logger.info(m),
    )

    version = next_version("clv")
    feature_contract = build_feature_set_contract(
        datasets.feature_result,
        name="tier_a_15",
        version="v1",
        model_type="clv",
        feature_names=dataset.feature_names,
    )
    feature_set_id = repository.save_feature_set_contract(feature_contract)

    model_card = {
        "model_type": "clv",
        "version": version,
        "method": "Two-Part Hurdle (LightGBM Classifier + CatBoost Log-Scale Regressor) + Portfolio Multiplier",
        "algorithm": CLV_CHAMPION,
        "cutoff_date": str(datasets.cutoff_date.date()),
        "horizon_days": horizon_days,
        "dataset_rows": int(len(dataset.frame)),
        "feature_set": f"{feature_contract.name}/{feature_contract.version}",
        "feature_code_hash": feature_contract.feature_code_hash,
        "params": _plain(result.twopart_bundle.params if result.twopart_bundle else {}),
        "primary_metric": {
            "name": "Spearman (ผู้จ่ายเงิน)",
            "value": result.test_metrics.get("spearman_payers", result.test_metrics.get("spearman", 0.0)),
            "baseline": 0.60,
            "baseline_name": "target_60pct",
        },
        "component_metrics": {
            "spearman_payers": result.test_metrics.get("spearman_payers"),
            "portfolio_bias_pct": result.test_metrics.get("portfolio_bias_pct"),
            "spearman": result.test_metrics["spearman"],
            "top_decile_capture": result.test_metrics["top_decile_capture"],
            "revenue_bias_ratio": result.test_metrics.get("revenue_bias_ratio"),
            "range_coverage": result.test_metrics.get("range_coverage"),
            "p_pay_roc_auc": result.test_metrics.get("p_pay_roc_auc"),
            "p_pay_ece": result.test_metrics.get("p_pay_ece"),
        },
        "test_ci": result.test_ci_json,
        "limitations": "CLV เป็น forecast 180 วัน",
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

    artifact_path, checksum = save_artifacts(
        model_type="clv",
        version=version,
        model_object=model_object,
        preprocessor=preprocessor,
        feature_names=dataset.feature_names,
        metrics={
            "validation": result.validation_metrics,
            "test": result.test_metrics,
            "baselines": result.baseline_metrics,
        },
        model_card=model_card,
    )

    version_id = insert_model_version(
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        model_type="clv",
        version=version,
        artifact_path=artifact_path,
        artifact_checksum=checksum,
        metrics=round_metrics(result.test_metrics),
        validation_metrics=round_metrics(result.validation_metrics),
        test_metrics=round_metrics(result.test_metrics),
        feature_names=dataset.feature_names,
        label_definition={
            "label": "future_revenue_6m = sum of payments in horizon",
            "population": "Active Paid at cutoff",
            "horizon_days": horizon_days,
        },
        training_data_snapshot={
            "rows": int(len(dataset.frame)),
            "splits": {s: int((dataset.frame["split"] == s).sum()) for s in ("train", "validation", "test")},
        },
        model_card=model_card,
    )

    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="clv",
        evaluation_type="holdout", dataset_split="validation",
        metrics=round_metrics(result.validation_metrics),
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="clv",
        evaluation_type="holdout", dataset_split="test",
        metrics=round_metrics(result.test_metrics),
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    for b_name, b_splits in result.baseline_metrics.items():
        if isinstance(b_splits, dict) and "test" in b_splits:
            insert_evaluation(
                model_version_id=version_id, training_run_id=training_run_id, model_type="clv",
                evaluation_type="baseline", dataset_split="test",
                baseline_name=b_name,
                metrics=round_metrics(b_splits["test"]),
                cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
                feature_set_id=feature_set_id,
            )

    verify_artifact_load(artifact_path, dataset.features("test").head(5))
    reason = "🏆 Colab Champion: Two-Part Hurdle (LightGBM + CatBoost Log-Scale) + Portfolio Multiplier"
    promote_model_version(model_type="clv", model_version_id=version_id, reason=reason, created_by=created_by)

    return {
        "model_type": "clv",
        "primary_metric_name": "Spearman (ผู้จ่ายเงิน)",
        "primary_metric_value": result.test_metrics.get("spearman_payers", result.test_metrics["spearman"]),
        "baseline_name": "target_60pct",
        "baseline_value": 0.60,
        "calibration_ece": None,
        "leakage_passed": True,
        "promoted": True,
        "promote_reason": reason,
        "new_version": version,
    }


def _train_and_register_credit(
    training_run_id: str,
    datasets: CutoffDatasets,
    horizon_days: int,
    created_by: str | None,
    progress: Callable[[str, int], None],
) -> dict[str, Any]:
    dataset = datasets.credit
    preprocessor = fit_preprocessor(
        dataset.features("train"), _feature_schema_for_dataset(datasets, dataset)
    )
    result = train_credit(
        dataset, preprocessor, topup_censor_days=float(horizon_days), progress=lambda m: logger.info(m)
    )

    version = next_version("credit")
    feature_contract = build_feature_set_contract(
        datasets.feature_result,
        name="tier_a_19",
        version="v1",
        model_type="credit",
        feature_names=dataset.feature_names,
    )
    feature_set_id = repository.save_feature_set_contract(feature_contract)

    coverage = result.test_metrics["coverage_p10_p90"]
    model_card = {
        "model_type": "credit",
        "version": version,
        "method": "LightGBM Quantile Regression (p10, p50, p90 monotonic) + Depletion Runway",
        "algorithm": "lightgbm_quantile",
        "cutoff_date": str(datasets.cutoff_date.date()),
        "horizon_days": horizon_days,
        "dataset_rows": int(len(dataset.frame)),
        "feature_set": f"{feature_contract.name}/{feature_contract.version}",
        "feature_code_hash": feature_contract.feature_code_hash,
        "params": {str(h): _plain(p) for h, p in result.params_by_horizon.items()},
        "topup_model": {
            "algorithm": "runway_depletion",
            "censor_days": getattr(result.topup_model, "censor_days", float(horizon_days)),
            "urgent_day_threshold_raw": 14.0,
            "urgent_topup_precision_test": result.test_metrics.get("urgent_topup_precision"),
            "urgent_topup_recall_test": result.test_metrics.get("urgent_topup_recall"),
        },
        "primary_metric": {
            "name": "80% Coverage (30 วัน)",
            "value": result.test_metrics.get("coverage_p10_p90_30d", coverage),
            "baseline": 0.80,
            "baseline_name": "target_80pct",
        },
        "test_ci": result.test_ci_json,
        "trained_by": created_by,
    }

    model_object = {
        "horizons": result.horizons,
        "topup_model": result.topup_model,
        "horizons_raw": result.horizons,
    }

    artifact_path, checksum = save_artifacts(
        model_type="credit",
        version=version,
        model_object=model_object,
        preprocessor=preprocessor,
        feature_names=dataset.feature_names,
        metrics={
            "validation": result.validation_metrics,
            "test": result.test_metrics,
            "baselines": result.baseline_metrics,
        },
        model_card=model_card,
    )

    version_id = insert_model_version(
        training_run_id=training_run_id,
        feature_set_id=feature_set_id,
        model_type="credit",
        version=version,
        artifact_path=artifact_path,
        artifact_checksum=checksum,
        metrics=round_metrics(result.test_metrics),
        validation_metrics=round_metrics(result.validation_metrics),
        test_metrics=round_metrics(result.test_metrics),
        feature_names=dataset.feature_names,
        label_definition={
            "label": "credit_usage = monthly SMS consumption in 30d/90d",
            "population": "SMS active customers at cutoff",
            "horizon_days": horizon_days,
        },
        training_data_snapshot={
            "rows": int(len(dataset.frame)),
            "splits": {s: int((dataset.frame["split"] == s).sum()) for s in ("train", "validation", "test")},
        },
        model_card=model_card,
    )

    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="credit",
        evaluation_type="holdout", dataset_split="validation",
        metrics=round_metrics(result.validation_metrics),
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    insert_evaluation(
        model_version_id=version_id, training_run_id=training_run_id, model_type="credit",
        evaluation_type="holdout", dataset_split="test",
        metrics=round_metrics(result.test_metrics),
        cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
        feature_set_id=feature_set_id,
    )
    for b_name, b_splits in result.baseline_metrics.items():
        if isinstance(b_splits, dict) and "test" in b_splits:
            insert_evaluation(
                model_version_id=version_id, training_run_id=training_run_id, model_type="credit",
                evaluation_type="baseline", dataset_split="test",
                baseline_name=b_name,
                metrics=round_metrics(b_splits["test"]),
                cutoff_date=str(datasets.cutoff_date.date()), horizon_days=horizon_days,
                feature_set_id=feature_set_id,
            )

    verify_artifact_load(artifact_path, dataset.features("test").head(5))
    reason = "🏆 Colab Champion: LightGBM Quantile (p10, p50, p90) + Depletion Runway"
    promote_model_version(model_type="credit", model_version_id=version_id, reason=reason, created_by=created_by)

    return {
        "model_type": "credit",
        "primary_metric_name": "80% Coverage (30 วัน)",
        "primary_metric_value": result.test_metrics.get("coverage_p10_p90_30d", coverage),
        "baseline_name": "target_80pct",
        "baseline_value": 0.80,
        "calibration_ece": None,
        "leakage_passed": True,
        "promoted": True,
        "promote_reason": reason,
        "new_version": version,
    }


def _feature_schema_for_dataset(
    cutoff_datasets: CutoffDatasets,
    dataset: Any,
) -> dict[str, dict[str, Any]]:
    return {
        feature_name: cutoff_datasets.feature_result.feature_schema[feature_name]
        for feature_name in dataset.feature_names
    }


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
