"""The ML service's one way into Postgres: a cached engine, JSON in and out of JSONB
columns, and the run-row reads and writes the training, prediction and outcome runners share.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from typing import Any

from sqlalchemy import Engine, create_engine, text

TRAINING_RUNS = "ml_training_runs"
PREDICTION_RUNS = "ml_prediction_runs"
_RUN_LABEL = {TRAINING_RUNS: "Training run", PREDICTION_RUNS: "Prediction run"}

#: Run-row keywords stored in JSONB columns, and the column each one writes.
_JSON_FIELDS = {
    "progress": "progress_json",
    "results": "results_json",
    "training_config": "training_config_json",
    "model_versions": "model_versions_json",
}


def database_url() -> str:
    """DATABASE_URL with the driver named explicitly.

    SQLAlchemy 2.1 maps a bare postgresql:// URL to psycopg 3, but the image ships psycopg2,
    and postgres:// (what Railway issues) is not accepted at all.
    """
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is required.")
    return re.sub(r"^postgres(?:ql)?://", "postgresql+psycopg2://", url)


@lru_cache(maxsize=1)
def engine() -> Engine:
    """One engine, and so one connection pool, per process."""
    return create_engine(database_url())


def to_json(value: Any) -> str:
    """JSON text for a JSONB parameter; values JSON cannot encode (dates, Decimals) become strings."""
    return json.dumps(value, ensure_ascii=False, default=str)


def from_json(value: Any) -> Any:
    """A JSONB value as Python. Some rows and drivers hand back the JSON text instead."""
    return json.loads(value) if isinstance(value, str) else value


def update_run(
    table: str,
    run_id: str,
    *,
    mark_started: bool = False,
    mark_finished: bool = False,
    **fields: Any,
) -> None:
    """Set exactly the columns passed as keywords on one run row (None clears a column).

    `progress`, `results`, `training_config` and `model_versions` go to their `*_json` JSONB
    columns; other keywords are column names.
    """
    sets: list[str] = []
    params: dict[str, Any] = {"id": run_id}
    for key, value in fields.items():
        if key in _JSON_FIELDS:
            sets.append(f"{_JSON_FIELDS[key]} = CAST(:{key} AS JSONB)")
            params[key] = to_json(value)
        else:
            sets.append(f"{key} = :{key}")
            params[key] = value
    if mark_started:
        sets.append("started_at = COALESCE(started_at, NOW())")
    if mark_finished:
        sets.append("finished_at = NOW()")
    if not sets:
        return
    with engine().begin() as conn:
        conn.execute(text(f"UPDATE {table} SET {', '.join(sets)} WHERE id = CAST(:id AS UUID)"), params)


def load_run(table: str, run_id: str, columns: str) -> dict[str, Any]:
    """One run row with the given SELECT columns; raises when the run does not exist."""
    with engine().connect() as conn:
        row = conn.execute(
            text(f"SELECT {columns} FROM {table} WHERE id = CAST(:id AS UUID)"), {"id": run_id}
        ).mappings().first()
    if row is None:
        raise RuntimeError(f"{_RUN_LABEL.get(table, 'Run')} {run_id} not found")
    return dict(row)
