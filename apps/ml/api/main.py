"""
1Moby Analytics ML API — internal-only.

All user-facing routes are served by the Elysia API service (apps/api/). FastAPI exists here for:
  - the Docker healthcheck (GET /health)
  - internal job triggers (training, prediction, outcome backfill), spawned as CLIs
  - synchronous model-registry operations (activate, delete, repoint production)

Every /internal route needs the x-internal-token header. There is no CORS: only the API
calls this service, server to server.
"""
import hmac
import os
import subprocess
import sys
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from src.db import engine

MODEL_DIR = Path(os.getenv("MODEL_DIR", str(Path(__file__).parent.parent.parent / "models")))
APP_ROOT = Path(__file__).resolve().parents[1]


def require_internal_token(x_internal_token: str = Header(default="")) -> None:
    expected = os.getenv("INTERNAL_SERVICE_TOKEN", "")
    if not expected or not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(403, "Invalid internal token")


app = FastAPI(title="1Moby ML API (internal)", version="6.0")
internal = [Depends(require_internal_token)]


# ── Health ─────────────────────────────────────────────────────────
@app.get("/health")
def health():
    with engine().connect() as conn:
        conn.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "db": "connected",
        "models_dir": str(MODEL_DIR),
        "message": "ML v2 internal API: health + training/prediction job triggers.",
    }


# ── Internal ML v2 job triggers ────────────────────────────────────
# Elysia creates the run row (status=pending) then POSTs here. The job runs
# as a detached subprocess so the HTTP call returns immediately; the runner
# itself owns all status/progress updates on the run row.


def _spawn_job(module: str, *args: str) -> int:
    # The child inherits stdout/stderr, so the CLIs' log lines (logging.basicConfig in
    # src/cli/*.py) appear in `docker compose logs ml`.
    process = subprocess.Popen(
        [sys.executable, "-m", module, *args],
        cwd=str(APP_ROOT),
        start_new_session=True,
    )
    return process.pid


class TrainingRunTrigger(BaseModel):
    training_run_id: str


class PredictionRunTrigger(BaseModel):
    prediction_run_id: str


class OutcomeBackfillTrigger(BaseModel):
    prediction_run_id: str | None = None
    force: bool = False


@app.post("/internal/training-runs", dependencies=internal)
def internal_training_run(body: TrainingRunTrigger):
    pid = _spawn_job("src.cli.train", "--training-run-id", body.training_run_id)
    return {"accepted": True, "training_run_id": body.training_run_id, "pid": pid}


@app.post("/internal/prediction-runs", dependencies=internal)
def internal_prediction_run(body: PredictionRunTrigger):
    pid = _spawn_job("src.cli.predict", "--prediction-run-id", body.prediction_run_id)
    return {"accepted": True, "prediction_run_id": body.prediction_run_id, "pid": pid}


@app.post("/internal/outcome-backfill", dependencies=internal)
def internal_outcome_backfill(body: OutcomeBackfillTrigger | None = None):
    """Realized-outcome backfill (TRAINING-PIPELINE §15).

    Body (all optional): { prediction_run_id, force }. Without an id the job
    measures every unmeasured completed prediction run; results land in
    ml_model_evaluations (evaluation_type='production_holdout').
    """
    body = body or OutcomeBackfillTrigger()
    args: list[str] = []
    if body.prediction_run_id:
        args += ["--prediction-run-id", body.prediction_run_id]
    if body.force:
        args.append("--force")
    pid = _spawn_job("src.cli.backfill_outcomes", *args)
    return {"accepted": True, "prediction_run_id": body.prediction_run_id, "pid": pid}


# ── Synchronous model-registry operations ──────────────────────────
# Plain `def`, so FastAPI runs them in its threadpool instead of blocking the event loop.
# A registry ValueError (a production or in-use version) is a 400, which the API answers as 409.


class ModelActivate(BaseModel):
    model_type: str
    model_version_id: str
    reason: str | None = None
    created_by: str | None = None


class RepointProduction(BaseModel):
    training_run_id: str
    created_by: str | None = None


class ModelDelete(BaseModel):
    model_type: str
    model_version_id: str
    created_by: str | None = None
    auto_promote_sole_remaining: bool = True


@app.post("/internal/model-activate", dependencies=internal)
def internal_model_activate(body: ModelActivate):
    """Manually pin a model version to production (UI override).

    Reuses the gate's promotion transaction so the registry stays consistent (one active
    version per type, alias + activation history).
    """
    from src.training.registry import activate_model_version

    try:
        result = activate_model_version(
            model_type=body.model_type,
            model_version_id=body.model_version_id,
            reason=body.reason,
            created_by=body.created_by,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"activated": True, **result}


@app.post("/internal/repoint-production-for-training-run", dependencies=internal)
def internal_repoint_production_for_training_run(body: RepointProduction):
    """Move production off champions owned by a training run before deleting it.

    Only safe when no prediction runs reference versions from the run (the API checks that
    first). Repoints to the newest remaining version per model type, or clears production
    when no replacement exists.
    """
    from src.training.registry import repoint_production_away_from_training_run

    try:
        result = repoint_production_away_from_training_run(
            training_run_id=body.training_run_id,
            created_by=body.created_by,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True, **result}


@app.post("/internal/model-delete", dependencies=internal)
def internal_model_delete(body: ModelDelete):
    """Permanently delete a non-production model version (UI action).

    Removes the registry row in one transaction, then the on-disk artifacts. The production
    champion is protected — the registry raises if the caller targets it.
    """
    from src.training.registry import delete_model_version

    try:
        result = delete_model_version(
            model_type=body.model_type,
            model_version_id=body.model_version_id,
            created_by=body.created_by,
            auto_promote_sole_remaining=body.auto_promote_sole_remaining,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return {"deleted": True, **result}
