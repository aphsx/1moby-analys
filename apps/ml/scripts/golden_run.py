#!/usr/bin/env python3
"""Golden run: an end-to-end regression check for ML and import changes.

`golden_run.sh` builds a scratch database with the sample workbook imported, then calls
`dump`, which trains, predicts, and writes the Prediction Outputs to CSV. Two dumps are
compared with `compare` (stdlib only, so it runs on the host):

  python3 apps/ml/scripts/golden_run.py compare before.csv after.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from pathlib import Path
from typing import Any

TRAIN_CUTOFF = "2025-07-01"
PREDICT_CUTOFF = "2026-01-01"
HORIZON_DAYS = 180
TOLERANCE = 1e-6
# Different on every run by design: ids, timestamps, version names, AI text (never generated here).
SKIP_COLUMNS = {
    "id",
    "prediction_run_id",
    "created_at",
    "model_versions_json",
    "ai_explanation",
    "ai_reasoning_json",
    "ai_generated_at",
    "ai_model",
    "ai_status",
}


def dump(out: Path) -> None:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from sqlalchemy import create_engine, text

    from src.prediction.runner import run_prediction
    from src.training.data import database_url
    from src.training.runner import run_training

    engine = create_engine(database_url())
    with engine.begin() as conn:
        train_source = conn.execute(text("SELECT id FROM train_data_sources")).scalar_one()
        predict_source = conn.execute(text("SELECT id FROM predict_data_sources")).scalar_one()
        training_run = conn.execute(
            text(
                "INSERT INTO ml_training_runs (source_id, cutoff_date, horizon_days) "
                "VALUES (:source, :cutoff, :horizon) RETURNING id"
            ),
            {"source": train_source, "cutoff": TRAIN_CUTOFF, "horizon": HORIZON_DAYS},
        ).scalar_one()
    run_training(str(training_run))

    with engine.begin() as conn:
        prediction_run = conn.execute(
            text(
                "INSERT INTO ml_prediction_runs (predict_source_id, cutoff_date) "
                "VALUES (:source, :cutoff) RETURNING id"
            ),
            {"source": predict_source, "cutoff": PREDICT_CUTOFF},
        ).scalar_one()
    run_prediction(str(prediction_run))

    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM ml_prediction_outputs WHERE prediction_run_id = :run ORDER BY acc_id"),
            {"run": prediction_run},
        ).mappings().all()
    if not rows:
        raise SystemExit("golden run produced no Prediction Outputs")

    columns = [c for c in rows[0].keys() if c not in SKIP_COLUMNS]
    with out.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        for row in rows:
            writer.writerow([_cell(row[c]) for c in columns])
    print(f"wrote {len(rows)} Prediction Outputs to {out}")


def _cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True, default=str)
    return str(value)


def _parse(cell: str) -> Any:
    try:
        return json.loads(cell)
    except ValueError:
        return cell


def _close(a: Any, b: Any) -> bool:
    """Numbers (also inside JSON) within TOLERANCE; everything else exactly equal."""
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=0, abs_tol=TOLERANCE)
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_close(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_close(x, y) for x, y in zip(a, b))
    return a == b


def compare(before: Path, after: Path, max_report: int = 20) -> int:
    with before.open(newline="") as f:
        old = list(csv.DictReader(f))
    with after.open(newline="") as f:
        new = list(csv.DictReader(f))
    if len(old) != len(new):
        print(f"row count differs: {len(old)} vs {len(new)}")
        return 1
    if old and old[0].keys() != new[0].keys():
        print(f"columns differ: {sorted(set(old[0]) ^ set(new[0]))}")
        return 1

    diffs = [
        (o["acc_id"], col, o[col], n[col])
        for o, n in zip(old, new)
        for col in o
        if not _close(_parse(o[col]), _parse(n[col]))
    ]
    for acc_id, col, a, b in diffs[:max_report]:
        print(f"acc_id={acc_id} {col}: {a!r} -> {b!r}")
    if diffs:
        print(f"{len(diffs)} differing cells")
        return 1
    print(f"golden run unchanged: {len(old)} Prediction Outputs match")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    dump_cmd = sub.add_parser("dump", help="train, predict and write Prediction Outputs to CSV")
    dump_cmd.add_argument("--out", type=Path, required=True)
    compare_cmd = sub.add_parser("compare", help="compare two dumps")
    compare_cmd.add_argument("before", type=Path)
    compare_cmd.add_argument("after", type=Path)
    args = parser.parse_args()

    if args.command == "dump":
        dump(args.out)
        return 0
    return compare(args.before, args.after)


if __name__ == "__main__":
    raise SystemExit(main())
