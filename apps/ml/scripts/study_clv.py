#!/usr/bin/env python3
"""Study what CLV can actually MEAN for this data (read-only EDA).

Answers, at the training cutoff, from the real bundled dataset:
  - How concentrated is future revenue? (Pareto / whale share)
  - Are customers one-time or repeat buyers?
  - How persistent is spend? (past 180d revenue -> future 6m revenue)
  - Base rates: P(pay in future) overall and given past activity.
  - Predictability ceiling: how much future revenue is "already big past spenders".

Run (from apps/ml, in the ml container):
    PYTHONPATH=/app python scripts/study_clv.py
"""
from __future__ import annotations

import os

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from src.training.data import load_train_clean
from src.training.datasets import build_cutoff_datasets
from src.training.clv_trainer import build_rfm_summary

SOURCE_ID = os.environ.get("SRC", "0205150b-13b6-4350-a747-0bcfad324eec")
CUTOFF = pd.Timestamp(os.environ.get("CUTOFF", "2025-07-01"))
HORIZON = int(os.environ.get("HORIZON", "180"))


def topk_share(values: np.ndarray, frac: float) -> float:
    v = np.sort(np.asarray(values, float))[::-1]
    if v.sum() <= 0:
        return 0.0
    k = max(1, int(np.ceil(len(v) * frac)))
    return float(v[:k].sum() / v.sum())


def gini(x: np.ndarray) -> float:
    x = np.sort(np.asarray(x, float))
    n = len(x)
    if n == 0 or x.sum() == 0:
        return 0.0
    cum = np.cumsum(x)
    return float((n + 1 - 2 * np.sum(cum) / cum[-1]) / n)


def main() -> None:
    cust, pay, use = load_train_clean(SOURCE_ID)
    cd = build_cutoff_datasets(cust, pay, use, CUTOFF, HORIZON)
    clv = cd.clv.frame  # eligible-for-CLV population (active in 180d before cutoff)

    y = pd.to_numeric(clv["future_revenue_6m"], errors="coerce").fillna(0.0).to_numpy()
    past180 = pd.to_numeric(clv["total_revenue_180d"], errors="coerce").fillna(0.0).to_numpy()
    past_all = pd.to_numeric(clv["total_revenue_all"], errors="coerce").fillna(0.0).to_numpy()
    pcount = pd.to_numeric(clv["payment_count_all"], errors="coerce").fillna(0.0).to_numpy()

    n = len(y)
    pay_future = y > 0
    pay_past180 = past180 > 0

    print(f"===== CLV DATA STUDY @ cutoff {CUTOFF.date()} horizon {HORIZON}d =====")
    print(f"eligible-for-CLV (active in prior 180d): n={n}")

    print("\n--- Future 6m revenue distribution ---")
    print(f"zero%={100*(~pay_future).mean():.1f}  payers={pay_future.sum()} ({100*pay_future.mean():.1f}%)")
    print(f"total={y.sum():,.0f}  mean={y.mean():,.0f}  median={np.median(y):,.0f}")
    for q in (0.5, 0.9, 0.95, 0.99):
        print(f"  q{int(q*100)}={np.quantile(y,q):,.0f}", end="")
    print(f"  max={y.max():,.0f}")

    print("\n--- Concentration of future revenue (who pays the money?) ---")
    print(f"top 1% share ={100*topk_share(y,0.01):.1f}%   top 5% ={100*topk_share(y,0.05):.1f}%   "
          f"top 10% ={100*topk_share(y,0.10):.1f}%   Gini={gini(y):.3f}")

    print("\n--- One-time vs repeat buyers (history before cutoff) ---")
    rfm = build_rfm_summary(pay, clv["acc_id"], CUTOFF).set_index("acc_id")
    freq = rfm["frequency"].reindex(clv["acc_id"].astype(int)).fillna(0).to_numpy()  # repeat purchases (#days-1)
    print(f"never paid before% ={100*(pcount==0).mean():.1f}")
    print(f"one-time payer% (freq==0) ={100*(freq==0).mean():.1f}   repeat payer% (freq>=1) ={100*(freq>=1).mean():.1f}")
    print(f"repeat payers (freq>=1): n={(freq>=1).sum()}  future-pay-rate={100*pay_future[freq>=1].mean():.1f}%")
    print(f"one-time (freq==0):      n={(freq==0).sum()}  future-pay-rate={100*pay_future[freq==0].mean():.1f}%")

    print("\n--- Persistence: does the past predict the future? ---")
    sp_all = spearmanr(past180, y).statistic
    sp_all_allhist = spearmanr(past_all, y).statistic
    print(f"Spearman(past_180d_rev, future_6m)  = {sp_all:.4f}")
    print(f"Spearman(past_all_rev,  future_6m)  = {sp_all_allhist:.4f}")
    if pay_future.sum() > 5:
        sp_payers = spearmanr(past180[pay_future], y[pay_future]).statistic
        print(f"Spearman among future-payers only   = {sp_payers:.4f} (n={int(pay_future.sum())})")

    print("\n--- Base rates (retention / conversion of spend) ---")
    print(f"P(pay in future)                    = {100*pay_future.mean():.1f}%")
    print(f"P(pay in future | paid in past180d) = {100*pay_future[pay_past180].mean():.1f}%  (n={int(pay_past180.sum())})")
    print(f"P(pay in future | NO pay past180d)  = {100*pay_future[~pay_past180].mean():.1f}%  (n={int((~pay_past180).sum())})")

    print("\n--- Predictability ceiling: is future revenue just 'already-big' customers? ---")
    order = np.argsort(-past180)
    k = max(1, int(np.ceil(n * 0.10)))
    top_past_idx = order[:k]
    share_future_from_top_past = y[top_past_idx].sum() / y.sum() if y.sum() > 0 else 0.0
    print(f"future revenue captured by top-10% PAST-180d spenders = {100*share_future_from_top_past:.1f}%")
    # among future whales (top 1% future), how many were already big in the past?
    fut_order = np.argsort(-y)
    fw = fut_order[:max(1, int(np.ceil(n*0.01)))]
    print(f"future top-1% revenue customers: median past_180d_rev={np.median(past180[fw]):,.0f}  "
          f"n_with_past_pay={int((past180[fw]>0).sum())}/{len(fw)}")


if __name__ == "__main__":
    main()
