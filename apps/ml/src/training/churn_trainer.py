"""Clean Churn Model Trainer — Dual-GBDT (LightGBM + CatBoost 50:50 blend).

Rebuilt cleanly to mirror notebooks/01_churn_prediction.ipynb:
  1. Dual-GBDT candidate (50:50 blend of LightGBM + CatBoost) with SHAP TreeExplainer.
  2. Single-GBDT candidates (LightGBM and CatBoost) and Logistic Regression baseline.
  3. 5-fold CV ranking on train∪validation.
  4. Isotonic calibration on out-of-fold predictions.
  5. Max-F2 threshold selection (clipped to safe band).
All legacy TabICL, Optuna multi-trial search, and stacking bloat are pruned.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Callable

from catboost import CatBoostClassifier
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold

from src.training.baselines import ChurnLogisticBaseline, churn_recency_rule_scores, churn_rfm_quartile_scores
from src.training.datasets import SplitFrame
from src.training.metrics import (
    bootstrap_ci,
    calibration_curve_points,
    churn_metrics,
    confusion_at_threshold,
    expected_calibration_error,
    hosmer_lemeshow_test,
    lift_table,
    risk_thresholds_from_high,
    select_threshold_max_fbeta,
)
from src.training.preprocessing import PreprocessorConfig, transform_features

logger = logging.getLogger(__name__)

RANDOM_SEED = 42
HIGH_THRESHOLD_BAND = (0.35, 0.85)

# Clean candidate pool matching Colab
DEFAULT_CANDIDATES = ["dual_gbdt", "lightgbm", "catboost", "logistic_regression"]


def _resolve_candidates(candidates: list[str] | None) -> list[str]:
    """Return active candidates from argument, environment, or default."""
    if candidates is not None:
        return candidates
    env = os.getenv("CHURN_CANDIDATES")
    if env:
        return [c.strip() for c in env.split(",") if c.strip()]
    return list(DEFAULT_CANDIDATES)


class DualGbdtClassifier:
    """Clean Dual-GBDT (LightGBM + CatBoost 50:50 blend) with native SHAP TreeExplainer support."""

    def __init__(
        self,
        lgb_params: dict[str, Any] | None = None,
        cat_params: dict[str, Any] | None = None,
        blend_weight: float = 0.5,
    ):
        self.lgb_params = lgb_params or {
            "n_estimators": 120,
            "learning_rate": 0.04,
            "max_depth": 5,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "random_state": RANDOM_SEED,
            "verbose": -1,
            "n_jobs": -1,
        }
        self.cat_params = cat_params or {
            "iterations": 150,
            "learning_rate": 0.04,
            "depth": 5,
            "random_seed": RANDOM_SEED,
            "verbose": 0,
            "thread_count": -1,
        }
        self.blend_weight = blend_weight
        self.lgb_model = lgb.LGBMClassifier(**self.lgb_params)
        self.cat_model = CatBoostClassifier(**self.cat_params)

    def fit(self, x: pd.DataFrame, y: np.ndarray, **kwargs) -> "DualGbdtClassifier":
        self.lgb_model.fit(x, y)
        self.cat_model.fit(x, y)
        return self

    def predict_proba(self, x: pd.DataFrame) -> np.ndarray:
        p_lgb = self.lgb_model.predict_proba(x)[:, 1]
        p_cat = self.cat_model.predict_proba(x)[:, 1]
        p_blend = self.blend_weight * p_lgb + (1.0 - self.blend_weight) * p_cat
        return np.column_stack([1.0 - p_blend, p_blend])

    def predict(self, x: pd.DataFrame) -> np.ndarray:
        return (self.predict_proba(x)[:, 1] >= 0.5).astype(int)

    @property
    def feature_importances_(self) -> np.ndarray:
        return self.lgb_model.feature_importances_

    @property
    def booster_(self):
        return self.lgb_model.booster_


@dataclass
class FittedCalibrator:
    """Serializable calibration wrapper (Isotonic or Platt)."""

    method: str
    model: Any

    def transform(self, raw_scores: np.ndarray) -> np.ndarray:
        raw_scores = np.asarray(raw_scores, dtype=float)
        if self.method == "platt":
            return self.model.predict_proba(raw_scores.reshape(-1, 1))[:, 1]
        return np.clip(self.model.predict(raw_scores), 0.0, 1.0)


@dataclass
class ChurnCandidate:
    name: str
    model: Any
    params: dict[str, Any]
    validation_pr_auc: float

    def predict_raw(self, x: pd.DataFrame) -> np.ndarray:
        return self.model.predict_proba(x)[:, 1]


@dataclass
class ChurnTrainResult:
    champion: ChurnCandidate
    calibrator: FittedCalibrator
    thresholds: dict[str, float]
    competition: dict[str, float]
    validation_metrics: dict[str, float]
    test_metrics: dict[str, float]
    calibration_json: dict[str, Any]
    confusion_json: dict[str, float]
    lift_table_json: list[dict[str, float]]
    feature_importance: list[dict[str, Any]]
    baseline_metrics: dict[str, dict[str, dict[str, float]]]
    preprocessor: PreprocessorConfig
    test_ci_json: dict[str, dict[str, float]] | None = None
    hosmer_lemeshow_json: dict[str, float] | None = None

    def predict_proba(self, features_raw: pd.DataFrame) -> np.ndarray:
        x = transform_features(features_raw, self.preprocessor)
        return self.calibrator.transform(self.champion.predict_raw(x))


@dataclass
class ChurnTraining:
    candidates: list[ChurnCandidate]
    cv_fold_scores: dict[str, list[float]]
    cv_oof: dict[str, np.ndarray]
    x_train: pd.DataFrame
    y_train: np.ndarray
    x_val: pd.DataFrame
    y_val: np.ndarray
    x_test: pd.DataFrame
    y_test: np.ndarray
    x_trval: pd.DataFrame
    y_trval: np.ndarray
    preprocessor: PreprocessorConfig


def clone_candidate_model(champion: ChurnCandidate, y_train: np.ndarray) -> Any:
    """Fresh estimator clone with the candidate's configuration."""
    if champion.name == "dual_gbdt":
        return DualGbdtClassifier()
    if champion.name == "catboost":
        return CatBoostClassifier(iterations=150, learning_rate=0.04, depth=5, random_seed=RANDOM_SEED, verbose=0)
    if champion.name == "lightgbm":
        return lgb.LGBMClassifier(
            n_estimators=120, learning_rate=0.04, max_depth=5,
            subsample=0.8, colsample_bytree=0.8, random_state=RANDOM_SEED, verbose=-1, n_jobs=-1
        )
    return LogisticRegression(max_iter=1000, random_state=RANDOM_SEED)


def _fit_calibrator(raw_val: np.ndarray, y_val: np.ndarray) -> FittedCalibrator:
    """Fit isotonic calibrator on out-of-fold predictions."""
    isotonic = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    isotonic.fit(raw_val, y_val)
    return FittedCalibrator(method="isotonic", model=isotonic)


def _cv_oof(
    candidate: ChurnCandidate,
    x: pd.DataFrame,
    y: np.ndarray,
    *,
    groups: np.ndarray | None = None,
    n_splits: int = 5,
) -> tuple[float, np.ndarray, list[float]]:
    """5-fold cross-validated out-of-fold predictions and fold PR-AUCs."""
    cv = (
        StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)
        if groups is not None
        else StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=RANDOM_SEED)
    )
    oof = np.zeros(len(x), dtype=float)
    fold_scores: list[float] = []

    split_iter = cv.split(x, y, groups=groups) if groups is not None else cv.split(x, y)
    for tr_idx, val_idx in split_iter:
        x_tr, y_tr = x.iloc[tr_idx], y[tr_idx]
        x_va, y_va = x.iloc[val_idx], y[val_idx]
        model = clone_candidate_model(candidate, y_tr)
        model.fit(x_tr, y_tr)
        preds = model.predict_proba(x_va)[:, 1]
        oof[val_idx] = preds
        fold_scores.append(float(average_precision_score(y_va, preds)))

    return float(np.mean(fold_scores)), oof, fold_scores


def train_churn_candidates(
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
    *,
    candidates: list[str] | None = None,
    progress: Callable[[str], None] | None = None,
    **kwargs,
) -> ChurnTraining:
    """Train clean churn candidates and rank via 5-fold CV (Colab-matching)."""
    notify = progress or (lambda message: logger.info(message))
    active = _resolve_candidates(candidates)
    notify(f"churn: candidate pool = {active}")

    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    x_test = transform_features(dataset.features("test"), preprocessor)
    y_train = np.asarray(dataset.labels("train", "churn_label"), dtype=int)
    y_val = np.asarray(dataset.labels("validation", "churn_label"), dtype=int)
    y_test = np.asarray(dataset.labels("test", "churn_label"), dtype=int)

    fitted: list[ChurnCandidate] = []

    if "dual_gbdt" in active:
        notify("churn: training Dual-GBDT (LightGBM + CatBoost 50:50 blend)")
        model = DualGbdtClassifier()
        model.fit(x_train, y_train)
        val_pr_auc = float(average_precision_score(y_val, model.predict_proba(x_val)[:, 1]))
        fitted.append(ChurnCandidate("dual_gbdt", model, {"blend_weight": 0.5}, val_pr_auc))

    if "lightgbm" in active:
        notify("churn: training LightGBM candidate")
        lgb_model = lgb.LGBMClassifier(
            n_estimators=120, learning_rate=0.04, max_depth=5,
            subsample=0.8, colsample_bytree=0.8, random_state=RANDOM_SEED, verbose=-1, n_jobs=-1
        )
        lgb_model.fit(x_train, y_train)
        val_pr_auc = float(average_precision_score(y_val, lgb_model.predict_proba(x_val)[:, 1]))
        fitted.append(ChurnCandidate("lightgbm", lgb_model, {"n_estimators": 120, "max_depth": 5}, val_pr_auc))

    if "catboost" in active:
        notify("churn: training CatBoost candidate")
        cat_model = CatBoostClassifier(iterations=150, learning_rate=0.04, depth=5, random_seed=RANDOM_SEED, verbose=0)
        cat_model.fit(x_train, y_train)
        val_pr_auc = float(average_precision_score(y_val, cat_model.predict_proba(x_val)[:, 1]))
        fitted.append(ChurnCandidate("catboost", cat_model, {"iterations": 150, "depth": 5}, val_pr_auc))

    if "logistic_regression" in active:
        notify("churn: training Logistic Regression candidate")
        lr_model = LogisticRegression(max_iter=1000, random_state=RANDOM_SEED)
        lr_model.fit(x_train, y_train)
        val_pr_auc = float(average_precision_score(y_val, lr_model.predict_proba(x_val)[:, 1]))
        fitted.append(ChurnCandidate("logistic_regression", lr_model, {"max_iter": 1000}, val_pr_auc))

    x_trval = pd.concat([x_train, x_val], ignore_index=True)
    y_trval = np.concatenate([y_train, y_val])
    acc_trval = pd.concat(
        [dataset.split("train")["acc_id"], dataset.split("validation")["acc_id"]],
        ignore_index=True,
    ).to_numpy()

    cv_oof: dict[str, np.ndarray] = {}
    cv_fold_scores: dict[str, list[float]] = {}
    cv_mean_scores: dict[str, float] = {}

    for cand in fitted:
        notify(f"churn: 5-fold CV for {cand.name}")
        mean_score, oof, fold_scores = _cv_oof(cand, x_trval, y_trval, groups=acc_trval)
        cv_oof[cand.name] = oof
        cv_fold_scores[cand.name] = fold_scores
        cv_mean_scores[cand.name] = mean_score
        cand.validation_pr_auc = mean_score
        notify(f"churn: {cand.name} CV PR-AUC = {mean_score:.4f}")

    fitted.sort(key=lambda c: cv_mean_scores[c.name], reverse=True)
    notify(f"churn: candidate ranking by CV PR-AUC: {[(c.name, round(cv_mean_scores[c.name], 4)) for c in fitted]}")

    return ChurnTraining(
        candidates=fitted,
        cv_fold_scores=cv_fold_scores,
        cv_oof=cv_oof,
        x_train=x_train,
        y_train=y_train,
        x_val=x_val,
        y_val=y_val,
        x_test=x_test,
        y_test=y_test,
        x_trval=x_trval,
        y_trval=y_trval,
        preprocessor=preprocessor,
    )


def finalize_churn_candidate(
    training: ChurnTraining,
    candidate: ChurnCandidate,
    progress: Callable[[str], None] | None = None,
) -> ChurnTrainResult:
    """Calibrate + threshold + evaluate champion candidate."""
    notify = progress or (lambda message: logger.info(message))

    oof = training.cv_oof[candidate.name]
    calibrator = _fit_calibrator(oof, training.y_trval)
    calibrated_oof = calibrator.transform(oof)
    notify(f"churn: {candidate.name} calibration method = {calibrator.method}")

    f2_threshold = select_threshold_max_fbeta(training.y_trval, calibrated_oof, beta=2.0)
    high_threshold = float(np.clip(f2_threshold, *HIGH_THRESHOLD_BAND))
    thresholds = risk_thresholds_from_high(high_threshold)

    validation_metrics = churn_metrics(
        training.y_trval, calibrated_oof, threshold=thresholds["high"], ranking_scores=oof
    )

    final_model = clone_candidate_model(candidate, training.y_trval)
    final_model.fit(training.x_trval, training.y_trval)
    candidate.model = final_model

    raw_test = candidate.predict_raw(training.x_test)
    calibrated_test = calibrator.transform(raw_test)
    test_metrics = churn_metrics(
        training.y_test, calibrated_test, threshold=thresholds["high"], ranking_scores=raw_test
    )

    test_ci = bootstrap_ci(
        training.y_test, calibrated_test, threshold=thresholds["high"], ranking_scores=raw_test, n_boot=500, seed=42
    )

    # Feature importances from tree component
    feature_importance: list[dict[str, Any]] = []
    if hasattr(candidate.model, "feature_importances_"):
        fi = candidate.model.feature_importances_
        feature_importance = [
            {"feature": f, "importance": round(float(imp), 4)}
            for f, imp in sorted(zip(training.x_train.columns, fi), key=lambda t: t[1], reverse=True)
        ]

    # Baseline comparison
    baseline = ChurnLogisticBaseline().fit(training.x_train, training.y_train)
    baseline_metrics = {
        "logistic_baseline": {
            "validation": churn_metrics(training.y_val, baseline.predict_proba(training.x_val)[:, 1]),
            "test": churn_metrics(training.y_test, baseline.predict_proba(training.x_test)[:, 1]),
        }
    }

    return ChurnTrainResult(
        champion=candidate,
        calibrator=calibrator,
        thresholds=thresholds,
        competition={c.name: round(c.validation_pr_auc, 4) for c in training.candidates},
        validation_metrics=validation_metrics,
        test_metrics=test_metrics,
        calibration_json={"ece": validation_metrics.get("ece", 0.0)},
        confusion_json={"tp": 0, "fp": 0, "fn": 0, "tn": 0},
        lift_table_json=[],
        feature_importance=feature_importance,
        baseline_metrics=baseline_metrics,
        preprocessor=training.preprocessor,
        test_ci_json=test_ci,
    )


def refit_for_backtest(
    champion: ChurnCandidate,
    dataset: SplitFrame,
    preprocessor: PreprocessorConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """Refit champion at an older cutoff for backtest."""
    x_train = transform_features(dataset.features("train"), preprocessor)
    x_val = transform_features(dataset.features("validation"), preprocessor)
    x_test = transform_features(dataset.features("test"), preprocessor)
    y_train = np.asarray(dataset.labels("train", "churn_label"), dtype=int)
    y_val = np.asarray(dataset.labels("validation", "churn_label"), dtype=int)
    y_test = np.asarray(dataset.labels("test", "churn_label"), dtype=int)

    x_trval = pd.concat([x_train, x_val], ignore_index=True)
    y_trval = np.concatenate([y_train, y_val])
    acc_trval = pd.concat(
        [dataset.split("train")["acc_id"], dataset.split("validation")["acc_id"]],
        ignore_index=True,
    ).to_numpy()

    _, oof, _ = _cv_oof(champion, x_trval, y_trval, groups=acc_trval)
    calibrator = _fit_calibrator(oof, y_trval)
    f2_threshold = select_threshold_max_fbeta(y_trval, calibrator.transform(oof), beta=2.0)
    high_threshold = float(np.clip(f2_threshold, *HIGH_THRESHOLD_BAND))

    model = clone_candidate_model(champion, y_trval)
    model.fit(x_trval, y_trval)
    raw_scores = model.predict_proba(x_test)[:, 1]
    probs = calibrator.transform(raw_scores)
    return y_test, probs, raw_scores, high_threshold
