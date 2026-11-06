#!/usr/bin/env python3
"""Contract check (no DB): a new Model Version never reuses a number or overwrites files.

next_version must skip numbers freed by a delete and folders orphaned by a failed run,
and artifact_dir must refuse an existing folder.

Run: python scripts/verify_model_versioning.py
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["MODEL_DIR"] = tempfile.mkdtemp()
os.environ.setdefault("DATABASE_URL", "postgresql://unused@localhost/unused")  # never connected

from src.training import artifacts, registry  # noqa: E402


def next_version_with(registered: list[str]) -> str:
    engine = mock.MagicMock()
    conn = engine.connect.return_value.__enter__.return_value
    conn.execute.return_value.scalars.return_value.all.return_value = registered
    with mock.patch.object(registry, "create_engine", return_value=engine):
        return registry.next_version("churn")


def main() -> int:
    month = registry.datetime.now(registry.timezone.utc).strftime("%Y.%m")
    v = lambda seq: f"churn-{month}.{seq}"  # noqa: E731

    assert next_version_with([]) == v(0)
    assert next_version_with([v(0), v(2)]) == v(3), "a deleted version's number was reused"
    artifacts.artifact_dir("churn", v(5))  # folder left behind by a failed run
    assert next_version_with([v(0)]) == v(6), "an orphaned folder's number was reused"
    try:
        artifacts.artifact_dir("churn", v(5))
    except FileExistsError:
        pass
    else:
        raise AssertionError("artifact_dir reused an existing folder")
    print("model versioning ok: numbers and folders are never reused")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
