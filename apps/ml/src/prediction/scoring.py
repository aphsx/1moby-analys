"""Apply the Champions to a Prediction Run's features: churn probability and risk level, CLV
(with the whale-tail blend), and credit quantiles plus the predicted days until the next top-up.
"""

from __future__ import annotations

import logging
import math
from typing import Any

import numpy as np
import pandas as pd

from src.constants import RiskLevel
from src.training.features import BASE_TIER_A_FEATURES, CREDIT_TIER_A_FEATURES, feature_code_hash
from src.training.preprocessing import transform_features
from src.prediction.persistence import json_scalar

logger = logging.getLogger(__name__)


TOPUP_CAP_DAYS = 365


# CLV hybrid tail correction (REMEDIATION-PLAN P1). All relative/scale-free.
CLV_TAIL_QUANTILE = 0.90  # only the top-decile whales may borrow the BG/NBD estimate


CLV_TAIL_MIN_POPULATION = 50  # below this, percentile tail detection is unreliable


CLV_TAIL_MIN_FREQUENCY = 2.0  # never blend single-payment customers


def features_for_bundle(frame: pd.DataFrame, bundle: dict[str, Any]) -> pd.DataFrame:
    feature_names = list(bundle["preprocessor"].feature_names)
    missing = [
        feature_name
        for feature_name in feature_names
        if feature_name not in frame.columns
    ]
    if missing:
        raise RuntimeError(
            f"Prediction features missing columns required by artifact: {missing}"
        )
    return frame[feature_names]


def feature_contract_guard(
    model_type: str, bundle: dict[str, Any], frame: pd.DataFrame
) -> None:
    """Validate required columns; allow legacy compatible hashes.

    Feature hashes are model-specific: churn and CLV use the 27-feature contract
    (tier_a_27), credit the extended 31-feature one (tier_a_31). If an older
    artifact's hash differs but all of its
    serialized preprocessor columns are present, prediction remains safe.
    """

    features = features_for_bundle(frame, bundle)  # hard-validates required columns present
    card = bundle["model_card"]
    trained_hash = card.get("feature_code_hash")
    current_hash = feature_code_hash(list(features.columns))
    if not trained_hash or trained_hash == current_hash:
        return

    # A mismatch has two very different causes. Distinguish them so a genuine
    # train/serve computation skew isn't hidden behind the same benign warning
    # as an old-contract artifact.
    trained_features = set(bundle.get("feature_names") or [])
    contract_features = set(CREDIT_TIER_A_FEATURES if model_type == "credit" else BASE_TIER_A_FEATURES)
    if trained_features != contract_features:
        # Artifact was trained on a different (typically narrower) feature
        # contract. Every column it actually consumes is present (validated
        # above), so serving is safe — just note the version lag.
        logger.warning(
            "Feature contract differs for %s champion %s (legacy narrower contract); "
            "all required columns present, serving is safe.",
            model_type,
            card.get("version"),
        )
    else:
        # Same feature list, but the builder SOURCE changed since training —
        # the values computed at serve time may not match what the model was
        # trained on (train/serve skew). Loud + actionable.
        logger.warning(
            "Feature COMPUTATION changed for %s champion %s since training "
            "(same feature list, different builder source) — potential train/serve "
            "skew; retrain/repromote recommended.",
            model_type,
            card.get("version"),
        )


def risk_level(probability: float, thresholds: dict[str, float]) -> str | None:
    if probability is None or (
        isinstance(probability, float) and math.isnan(probability)
    ):
        return None
    if probability >= thresholds["critical"]:
        return RiskLevel.CRITICAL
    if probability >= thresholds["high"]:
        return RiskLevel.HIGH
    if probability >= thresholds["medium"]:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


def churn_shap_factors(
    churn_bundle: dict[str, Any],
    features_raw: pd.DataFrame,
    frame: pd.DataFrame,
    churn_mask: np.ndarray,
) -> tuple[list[list[dict[str, Any]] | None], str | None]:
    """Top-5 SHAP factors per eligible customer (§3.4), plus the error if SHAP failed."""

    factors: list[list[dict[str, Any]] | None] = [None] * len(frame)
    if not churn_mask.any():
        return factors, None
    try:
        x = transform_features(features_raw[churn_mask], churn_bundle["preprocessor"])
        model = churn_bundle["model"]
        if hasattr(model, "coef_"):
            # Linear champion: SHAP of a linear model on standardized features
            # is exactly coef_j × x_ij (relative to the feature mean).
            values = np.asarray(x) * np.asarray(model.coef_[0])
        elif hasattr(model, "feature_importances_"):
            # Tree champion (LightGBM / XGBoost / RandomForest): TreeExplainer is
            # exact and fast enough to run on the full eligible population.
            import shap

            explainer = shap.TreeExplainer(model)
            values = explainer.shap_values(x)
            if isinstance(values, list):
                values = values[1]
            if getattr(values, "ndim", 2) == 3:
                values = values[:, :, 1]
        else:
            # Opaque champion (e.g. TabICL foundation model): no tree structure
            # for TreeExplainer, and KernelExplainer is far too slow to run per
            # customer at serve scale. Emit no per-row factors rather than
            # fabricate directions — global permutation importance is still
            # available in the model card for population-level explanation.
            logger.warning(
                "churn champion %s is not SHAP-explainable at serve time; "
                "per-customer churn_factors will be null (see model_card feature_importance)",
                type(model).__name__,
            )
            return factors, None
    except Exception as exc:  # noqa: BLE001 - explainability failure must not block the run.
        logger.warning("SHAP factors unavailable: %s", exc)
        return factors, f"{type(exc).__name__}: {exc}"

    feature_names = list(x.columns)
    raw_values = features_raw[churn_mask].reset_index(drop=True)
    mask_positions = np.flatnonzero(churn_mask)
    for row_index, frame_position in enumerate(mask_positions):
        row_shap = values[row_index]
        top = np.argsort(-np.abs(row_shap))[:5]
        factors[frame_position] = [
            {
                "feature": feature_names[j],
                "value": json_scalar(raw_values.iloc[row_index][feature_names[j]]),
                "direction": "up" if row_shap[j] > 0 else "down",
                "impact": round(float(abs(row_shap[j])), 4),
            }
            for j in top
        ]
    return factors, None


def _blend_clv_tail(
    base_pred: np.ndarray,
    *,
    bg_clv: np.ndarray,
    freq: np.ndarray,
    revenue: np.ndarray,
    tail_quantile: float = CLV_TAIL_QUANTILE,
) -> np.ndarray:
    """Lift the whale tail of a CLV point forecast with BG/NBD (serve-time).

    Tree-based revenue models cannot extrapolate beyond training leaves, so they
    under-predict whales. BG/NBD scales with monetary value (no ceiling), so for
    the top-decile tail take the higher of the two. Kept tight (top decile)
    because BG/NBD over-predicts the body.
    """

    if len(base_pred) < CLV_TAIL_MIN_POPULATION:
        return base_pred

    tail = np.zeros(len(base_pred), dtype=bool)
    fok = freq[np.isfinite(freq)]
    if fok.size:
        cut = max(float(np.quantile(fok, tail_quantile)), CLV_TAIL_MIN_FREQUENCY)
        tail |= np.nan_to_num(freq, nan=0.0) >= cut
    rok = revenue[np.isfinite(revenue)]
    if rok.size:
        tail |= np.nan_to_num(revenue, nan=0.0) >= float(
            np.quantile(rok, tail_quantile)
        )

    blended = base_pred.copy()
    blended[tail] = np.maximum(base_pred[tail], bg_clv[tail])
    return blended


def apply_clv(
    frame: pd.DataFrame,
    clv_bundle: dict[str, Any],
    features_raw: pd.DataFrame,
    payments: pd.DataFrame,
    cutoff: pd.Timestamp,
) -> pd.DataFrame:
    from src.training.clv_trainer import build_rfm_summary

    model_object = clv_bundle["model"]
    clv_mask = frame["el_clv"].to_numpy()
    predicted = np.full(len(frame), np.nan)
    p_alive = np.full(len(frame), np.nan)
    clv_pay_probability = np.full(len(frame), np.nan)
    clv_interval: list[dict[str, float] | None] = [None] * len(frame)

    if clv_mask.any():
        eligible_acc = frame.loc[clv_mask, "acc_id"]
        rfm = build_rfm_summary(payments, eligible_acc, cutoff)
        bgnbd = model_object.get("bgnbd")
        bg_pred = None
        if bgnbd is not None:
            bg_pred = bgnbd.predict_frame(rfm).set_index("acc_id")
            p_alive[clv_mask] = (
                eligible_acc.map(bg_pred["p_alive"]).fillna(np.nan).to_numpy()
            )

        twopart = model_object.get("twopart")
        if twopart is None:
            champion = model_object.get("champion", "unknown")
            raise RuntimeError(
                f"CLV artifact champion={champion!r} is retired; retrain CLV (twopart)."
            )

        xx = transform_features(features_raw[clv_mask], clv_bundle["preprocessor"])
        pp = np.clip(twopart.p_pay(xx), 0.0, 1.0)
        v10 = twopart.value_quantile(xx, 0.10)
        v50 = twopart.value_quantile(xx, 0.50)
        v90 = twopart.value_quantile(xx, 0.90)
        raw_expected = pp * v50
        if bg_pred is not None:
            tail_q = float(
                clv_bundle.get("model_card", {}).get("clv_tail_quantile", CLV_TAIL_QUANTILE)
            )
            raw_expected = _blend_clv_tail(
                raw_expected,
                bg_clv=eligible_acc.map(bg_pred["predicted_clv"]).fillna(0.0).to_numpy(),
                freq=pd.to_numeric(features_raw["payment_count_all"], errors="coerce")
                .to_numpy()[clv_mask],
                revenue=pd.to_numeric(features_raw["total_revenue_all"], errors="coerce")
                .to_numpy()[clv_mask],
                tail_quantile=tail_q,
            )
        mag_slope = float(model_object.get("magnitude_slope", 1.0))
        mag_intercept = float(model_object.get("magnitude_intercept", 0.0))
        expected = np.clip(mag_slope * raw_expected + mag_intercept, 0.0, None)
        predicted[clv_mask] = expected
        clv_pay_probability[clv_mask] = pp
        v10_cal = np.clip(mag_slope * v10, 0.0, None)
        v50_cal = np.clip(mag_slope * v50, 0.0, None)
        v90_cal = np.clip(mag_slope * v90, 0.0, None)
        for i, fp in enumerate(np.flatnonzero(clv_mask)):
            clv_interval[fp] = {
                "p10": round(float(v10_cal[i]), 2),
                "p50": round(float(v50_cal[i]), 2),
                "p90": round(float(v90_cal[i]), 2),
            }

    frame["predicted_clv_6m"] = predicted
    frame["clv_pay_probability"] = np.clip(clv_pay_probability, 0.0, 1.0)
    frame["clv_forecast_interval"] = clv_interval
    frame["p_alive"] = np.clip(p_alive, 0.0, 1.0)
    return frame


def apply_credit(
    frame: pd.DataFrame,
    credit_bundle: dict[str, Any],
    features_raw: pd.DataFrame,
) -> pd.DataFrame:
    horizons = credit_bundle["model"]["horizons"]
    topup_model = credit_bundle["model"].get("topup_model")
    credit_mask = frame["el_credit"].to_numpy()
    columns = {
        "predicted_credit_usage_30d": np.nan,
        "predicted_credit_usage_90d": np.nan,
        "credit_p10_30d": np.nan,
        "credit_p90_30d": np.nan,
        "credit_p10_90d": np.nan,
        "credit_p90_90d": np.nan,
        "estimated_days_until_topup": np.nan,
    }
    for name, default in columns.items():
        frame[name] = default

    if credit_mask.any():
        from src.training.credit_trainer import credit_anchor_log

        x = transform_features(features_raw[credit_mask], credit_bundle["preprocessor"])
        q30 = horizons[30].predict_quantiles(
            x, credit_anchor_log(features_raw[credit_mask], 30)
        )
        q90 = horizons[90].predict_quantiles(
            x, credit_anchor_log(features_raw[credit_mask], 90)
        )
        # The 30d and 90d quantiles come from independent heads, so a longer
        # horizon can occasionally fall below a shorter one. Cumulative usage is
        # non-decreasing in time, so enforce 90d >= 30d per quantile (cheap,
        # removes the ~3% cross-horizon inversions seen in the audit).
        p50_30 = np.asarray(q30[0.50], dtype=float)
        p10_30 = np.asarray(q30[0.10], dtype=float)
        p90_30 = np.asarray(q30[0.90], dtype=float)
        frame.loc[credit_mask, "predicted_credit_usage_30d"] = p50_30
        frame.loc[credit_mask, "predicted_credit_usage_90d"] = np.maximum(
            q90[0.50], p50_30
        )
        frame.loc[credit_mask, "credit_p10_30d"] = p10_30
        frame.loc[credit_mask, "credit_p90_30d"] = p90_30
        frame.loc[credit_mask, "credit_p10_90d"] = np.maximum(q90[0.10], p10_30)
        frame.loc[credit_mask, "credit_p90_90d"] = np.maximum(q90[0.90], p90_30)
        if topup_model is not None:
            # AFT model trained on the censored days_until_next_topup label —
            # replaces the balance/burn heuristic (kept as fallback for older
            # artifacts without the model, see apply_derived).
            days = topup_model.predict_days(x)
            frame.loc[credit_mask, "estimated_days_until_topup"] = np.minimum(
                np.ceil(days), TOPUP_CAP_DAYS
            )
    return frame
