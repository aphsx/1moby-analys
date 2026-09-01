#!/usr/bin/env python3
"""Test-first prototype: redesigned two-part CLV vs the current Tweedie point model.

Two-part (hurdle) design:
    p_pay          = P(future_revenue_6m > 0)              (LightGBM binary)
    value | pay    = quantile regression on log1p(revenue) (LightGBM, positive-only)
    expected_clv   = p_pay * expm1(value_p50)
    range          = [expm1(value_p10), expm1(value_p90)]  (uncertainty band)

Compared against the current Tweedie point model on the SAME train/val/test
split. All metrics computed inline (independent of any pipeline edits). Read-only
w.r.t. the DB/registry — decision harness only.

Run (from apps/ml, in the ml container):
    PYTHONPATH=/app python scripts/eval_clv_redesign.py
"""
from __future__ import annotations

import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score

from src.training.data import load_train_clean
from src.training.datasets import build_cutoff_datasets
from src.training.preprocessing import fit_preprocessor, transform_features

SOURCE_ID = os.environ.get("SRC", "0205150b-13b6-4350-a747-0bcfad324eec")
CUTOFF = pd.Timestamp(os.environ.get("CUTOFF", "2025-07-01"))
HORIZON = int(os.environ.get("HORIZON", "180"))
SEED = 42
BASE = dict(n_estimators=1500, num_leaves=64, learning_rate=0.05, min_child_samples=50,
            feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1,
            random_state=SEED, n_jobs=-1, verbosity=-1)
CB = [lgb.early_stopping(50, verbose=False), lgb.log_evaluation(0)]


def ece(y_true01: np.ndarray, p: np.ndarray, n_bins: int = 10) -> float:
    y_true01 = np.asarray(y_true01, float)
    p = np.clip(np.asarray(p, float), 0, 1)
    bins = np.linspace(0, 1, n_bins + 1)
    ids = np.clip(np.digitize(p, bins[1:-1]), 0, n_bins - 1)
    out = 0.0
    for b in range(n_bins):
        m = ids == b
        if m.any():
            out += m.mean() * abs(y_true01[m].mean() - p[m].mean())
    return float(out)


def top_decile_capture(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, float)
    tot = y_true.sum()
    if tot <= 0:
        return 0.0
    k = max(1, int(np.ceil(len(y_true) * 0.10)))
    idx = np.argsort(-np.asarray(y_pred, float))[:k]
    return float(y_true[idx].sum() / tot)


def point_report(name: str, y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    y_true = np.asarray(y_true, float)
    y_pred = np.clip(np.asarray(y_pred, float), 0, None)
    sp = spearmanr(y_true, y_pred).statistic
    mae = float(np.mean(np.abs(y_pred - y_true)))
    rmse = float(np.sqrt(np.mean((y_pred - y_true) ** 2)))
    ta, tp = float(y_true.sum()), float(y_pred.sum())
    return {
        "model": name,
        "spearman": round(0.0 if np.isnan(sp) else float(sp), 4),
        "top10cap": round(top_decile_capture(y_true, y_pred), 4),
        "mae": round(mae, 0),
        "rmse": round(rmse, 0),
        "total_ratio": round(tp / ta, 4) if ta > 0 else float("nan"),
    }


def total_shrink(pred_val, y_val, pred_te):
    sp = float(np.clip(pred_val, 0, None).sum())
    if sp <= 0 or y_val.sum() <= 0:
        return pred_te
    slope = float(np.clip((y_val.sum() / sp) ** 0.5, 0.5, 2.0))
    return np.clip(pred_te, 0, None) * slope


def main() -> None:
    cust, pay, use = load_train_clean(SOURCE_ID)
    ds = build_cutoff_datasets(cust, pay, use, CUTOFF, HORIZON).clv
    ytr = pd.to_numeric(ds.labels("train", "future_revenue_6m"), errors="coerce").fillna(0.0).to_numpy()
    yva = pd.to_numeric(ds.labels("validation", "future_revenue_6m"), errors="coerce").fillna(0.0).to_numpy()
    yte = pd.to_numeric(ds.labels("test", "future_revenue_6m"), errors="coerce").fillna(0.0).to_numpy()
    pp = fit_preprocessor(ds.features("train"))
    Xtr, Xva, Xte = (transform_features(ds.features(s), pp) for s in ("train", "validation", "test"))

    rows = []

    # ── A: current Tweedie point model ──
    mA = lgb.LGBMRegressor(objective="tweedie", tweedie_variance_power=1.5, **BASE)
    mA.fit(Xtr, ytr, eval_set=[(Xva, yva)], callbacks=CB)
    pA_va, pA_te = mA.predict(Xva), mA.predict(Xte)
    rows.append(point_report("A tweedie (current)", yte, total_shrink(pA_va, yva, pA_te)))

    # ── B: two-part (hurdle) redesign ──
    paytr, payva = (ytr > 0).astype(int), (yva > 0).astype(int)
    payte = (yte > 0).astype(int)
    clf = lgb.LGBMClassifier(objective="binary", **BASE)
    clf.fit(Xtr, paytr, eval_set=[(Xva, payva)], callbacks=CB)
    ppay_va = np.clip(clf.predict_proba(Xva)[:, 1], 0, 1)
    ppay_te = np.clip(clf.predict_proba(Xte)[:, 1], 0, 1)

    pos = ytr > 0
    ltr = np.log1p(ytr[pos])
    pos_va = yva > 0
    lva = np.log1p(yva[pos_va])
    q = {}
    for a in (0.10, 0.50, 0.90):
        m = lgb.LGBMRegressor(objective="quantile", alpha=a, **BASE)
        if pos_va.sum() >= 20:
            m.fit(Xtr[pos], ltr, eval_set=[(Xva[pos_va], lva)], callbacks=CB)
        else:
            m.fit(Xtr[pos], ltr)
        q[a] = m
    v_p50_te = np.expm1(np.clip(q[0.50].predict(Xte), 0, None))
    v_p10_te = np.expm1(np.clip(q[0.10].predict(Xte), 0, None))
    v_p90_te = np.expm1(np.clip(q[0.90].predict(Xte), 0, None))
    v_p50_va = np.expm1(np.clip(q[0.50].predict(Xva), 0, None))

    exp_te = ppay_te * v_p50_te
    exp_va = ppay_va * v_p50_va
    rows.append(point_report("B two-part expected_clv", yte, total_shrink(exp_va, yva, exp_te)))

    print("=== Label: test n={} zero%={:.1f} total_actual={:,.0f} ===".format(
        len(yte), 100 * (yte == 0).mean(), yte.sum()))
    print("\n=== POINT metrics on TEST (ranking + total + magnitude) ===")
    dfp = pd.DataFrame(rows)
    with pd.option_context("display.width", 200, "display.float_format", lambda v: f"{v:,.4f}"):
        print(dfp.to_string(index=False))

    # ── New capabilities of the redesign ──
    print("\n=== NEW: p_pay (will-they-pay) calibration/discrimination on TEST ===")
    print(f"  ROC-AUC={roc_auc_score(payte, ppay_te):.4f}  PR-AUC={average_precision_score(payte, ppay_te):.4f}"
          f"  Brier={brier_score_loss(payte, ppay_te):.4f}  ECE={ece(payte, ppay_te):.4f}"
          f"  base_pay_rate={payte.mean():.4f}")

    pmask = yte > 0
    cov = float(((yte[pmask] >= v_p10_te[pmask]) & (yte[pmask] <= v_p90_te[pmask])).mean())
    print("\n=== NEW: value|pay range coverage (target ~0.80) ===")
    print(f"  p10-p90 coverage on actual-payers = {cov:.4f} (n_payers={int(pmask.sum())})")


if __name__ == "__main__":
    main()
