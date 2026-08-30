#!/usr/bin/env python3
"""CLV accuracy experiment — compare the current Tweedie approach against a
log-space model + total-sum calibration, on the SAME train/val/test split.

Read-only w.r.t. the DB and registry: it loads train_clean_*, rebuilds the CLV
dataset at a cutoff, fits candidate models, and prints metrics INCLUDING the
total-revenue error (Σ predicted vs Σ actual) that the shipped pipeline never
measures. Nothing is written to ml_model_* tables.

Run (from apps/ml, inside the ml container):
    PYTHONPATH=/app python scripts/eval_clv_experiment.py
"""
from __future__ import annotations

import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.linear_model import LinearRegression

from src.training.data import load_train_clean
from src.training.datasets import build_cutoff_datasets
from src.training.preprocessing import fit_preprocessor, transform_features
from src.training.metrics import clv_metrics

SOURCE_ID = os.environ.get("SRC", "0205150b-13b6-4350-a747-0bcfad324eec")
CUTOFF = pd.Timestamp(os.environ.get("CUTOFF", "2025-07-01"))
HORIZON = int(os.environ.get("HORIZON", "180"))
SEED = 42

BASE = dict(
    n_estimators=1500,
    num_leaves=64,
    learning_rate=0.05,
    min_child_samples=50,
    feature_fraction=0.8,
    bagging_fraction=0.8,
    bagging_freq=1,
    random_state=SEED,
    n_jobs=-1,
    verbosity=-1,
)
CB = [lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)]


def extended(name: str, y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.clip(np.asarray(y_pred, dtype=float), 0.0, None)
    m = clv_metrics(y_true, y_pred)
    tot_p, tot_a = float(y_pred.sum()), float(y_true.sum())
    # per-customer "within 50%" accuracy on customers with real revenue
    pos = y_true > 0
    rel = np.abs(y_pred[pos] - y_true[pos]) / np.clip(y_true[pos], 1e-9, None)
    within50 = float((rel <= 0.5).mean()) if pos.any() else float("nan")
    return {
        "model": name,
        "spearman": m["spearman"],
        "mae": m["mae"],
        "rmse": m["rmse"],
        "rmsle": m["rmsle"],
        "smape": m["smape"],
        "top10cap": m["top_decile_capture"],
        "total_pred": round(tot_p, 0),
        "total_actual": round(tot_a, 0),
        "total_ratio": round(tot_p / tot_a, 4) if tot_a > 0 else float("nan"),
        "within50pct": round(within50, 4),
    }


def total_calib(pred_val: np.ndarray, y_val: np.ndarray) -> float:
    s = float(np.clip(pred_val, 0, None).sum())
    return float(y_val.sum() / s) if s > 0 else 1.0


def ols_calib(pred_val: np.ndarray, y_val: np.ndarray):
    lr = LinearRegression().fit(np.clip(pred_val, 0, None).reshape(-1, 1), y_val)
    slope = float(np.clip(lr.coef_[0], 0.01, 20.0))
    return slope, float(lr.intercept_)


def main() -> None:
    print(f"Loading train_clean for source={SOURCE_ID} cutoff={CUTOFF.date()} horizon={HORIZON}")
    cust, pay, use = load_train_clean(SOURCE_ID)
    ds = build_cutoff_datasets(cust, pay, use, CUTOFF, HORIZON).clv

    ytr = pd.to_numeric(ds.labels("train", "future_revenue_6m"), errors="coerce").fillna(0.0).to_numpy()
    yva = pd.to_numeric(ds.labels("validation", "future_revenue_6m"), errors="coerce").fillna(0.0).to_numpy()
    yte = pd.to_numeric(ds.labels("test", "future_revenue_6m"), errors="coerce").fillna(0.0).to_numpy()

    pp = fit_preprocessor(ds.features("train"))
    Xtr = transform_features(ds.features("train"), pp)
    Xva = transform_features(ds.features("validation"), pp)
    Xte = transform_features(ds.features("test"), pp)

    print("\n=== Label distribution (future_revenue_6m) ===")
    for nm, y in [("train", ytr), ("val", yva), ("test", yte)]:
        y = np.asarray(y, float)
        print(f"{nm}: n={len(y)} zero%={100*(y==0).mean():.1f} mean={y.mean():,.0f} "
              f"median={np.median(y):,.0f} max={y.max():,.0f} sum={y.sum():,.0f}")

    rows = []

    # ── A: current approach — Tweedie on raw revenue ──
    mA = lgb.LGBMRegressor(objective="tweedie", tweedie_variance_power=1.5, **BASE)
    mA.fit(Xtr, ytr, eval_set=[(Xva, yva)], callbacks=CB)
    pA_va, pA_te = mA.predict(Xva), mA.predict(Xte)
    rows.append(extended("A tweedie (raw, no calib)", yte, pA_te))

    # A+OLS ≈ current production (magnitude calibration on validation)
    s, b = ols_calib(pA_va, yva)
    rows.append(extended("A tweedie + OLS calib (≈production)", yte, s * np.clip(pA_te, 0, None) + b))

    # A + total-sum calibration
    cA = total_calib(pA_va, yva)
    rows.append(extended("A tweedie + total-sum calib", yte, np.clip(pA_te, 0, None) * cA))

    # ── B: proposed — log1p-space L2 + total-sum calibration ──
    ttr, tva = np.log1p(ytr), np.log1p(yva)
    mB = lgb.LGBMRegressor(objective="regression", **BASE)
    mB.fit(Xtr, ttr, eval_set=[(Xva, tva)], callbacks=CB)
    bB_va = np.expm1(np.clip(mB.predict(Xva), 0, None))
    bB_te = np.expm1(np.clip(mB.predict(Xte), 0, None))
    rows.append(extended("B log-L2 (naive expm1)", yte, bB_te))
    cB = total_calib(bB_va, yva)
    rows.append(extended("B log-L2 + total-sum calib", yte, bB_te * cB))
    sB, bB = ols_calib(bB_va, yva)
    rows.append(extended("B log-L2 + OLS calib", yte, sB * bB_te + bB))

    # ── Baseline: carryover (repeat last 180d revenue) ──
    carry_te = pd.to_numeric(ds.features("test")["total_revenue_180d"], errors="coerce").fillna(0.0).to_numpy()
    rows.append(extended("baseline carryover_180d", yte, carry_te))

    print("\n=== TEST metrics (n={}) — lower MAE/RMSE/RMSLE/SMAPE better; total_ratio→1.0 best ===".format(len(yte)))
    df = pd.DataFrame(rows)
    with pd.option_context("display.max_columns", None, "display.width", 200, "display.float_format", lambda v: f"{v:,.4f}"):
        print(df.to_string(index=False))


if __name__ == "__main__":
    main()
