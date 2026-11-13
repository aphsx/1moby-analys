"""Model registry persistence: versions, evaluations, aliases, promotion.

TRAINING-PIPELINE §14 — every trained model becomes a row in
`ml_model_versions` (candidate → production → archived); the prediction
runner only ever loads through the `production` alias; every activation is
recorded in `ml_model_activation_history`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Connection

from src.db import engine, to_json

PRODUCTION_ALIAS = "production"


def next_version(model_type: str) -> str:
    """Version naming: {type}-{YYYY.MM}.{seq}, seq one past the highest used this month.

    Counts both registered versions and artifact folders on disk, so a deleted version
    or a folder orphaned by a failed run is never handed out again. (A count of rows
    reused numbers after a delete and overwrote that version's files.)
    """
    from src.training.artifacts import models_dir

    prefix = f"{model_type}-{datetime.now(timezone.utc).strftime('%Y.%m')}"
    with engine().connect() as conn:
        registered = conn.execute(
            text("SELECT version FROM ml_model_versions WHERE model_type = :model_type AND version LIKE :prefix"),
            {"model_type": model_type, "prefix": f"{prefix}.%"},
        ).scalars().all()
    on_disk = [p.name for p in (models_dir() / model_type).glob(f"{prefix}.*")]
    used = [int(seq) for _, seq in (v.rsplit(".", 1) for v in [*registered, *on_disk]) if seq.isdigit()]
    return f"{prefix}.{max(used, default=-1) + 1}"


def insert_model_version(
    *,
    training_run_id: str,
    feature_set_id: str | None,
    model_type: str,
    version: str,
    artifact_path: str,
    artifact_checksum: str,
    metrics: dict[str, Any],
    validation_metrics: dict[str, Any],
    test_metrics: dict[str, Any],
    feature_names: list[str],
    label_definition: dict[str, Any],
    training_data_snapshot: dict[str, Any],
    model_card: dict[str, Any],
    status: str = "candidate",
) -> str:
    with engine().begin() as conn:
        version_id = conn.execute(
            text(
                """
                INSERT INTO ml_model_versions (
                  training_run_id, feature_set_id, model_type, version, status,
                  artifact_path, artifact_checksum, metrics_json,
                  validation_metrics_json, test_metrics_json, feature_names_json,
                  label_definition_json, training_data_snapshot_json,
                  model_card_json, trained_at
                ) VALUES (
                  CAST(:training_run_id AS UUID), CAST(:feature_set_id AS UUID),
                  :model_type, :version, :status, :artifact_path, :artifact_checksum,
                  CAST(:metrics AS JSONB), CAST(:validation_metrics AS JSONB),
                  CAST(:test_metrics AS JSONB), CAST(:feature_names AS JSONB),
                  CAST(:label_definition AS JSONB), CAST(:training_data_snapshot AS JSONB),
                  CAST(:model_card AS JSONB), NOW()
                )
                RETURNING id::text
                """
            ),
            {
                "training_run_id": training_run_id,
                "feature_set_id": feature_set_id,
                "model_type": model_type,
                "version": version,
                "status": status,
                "artifact_path": artifact_path,
                "artifact_checksum": artifact_checksum,
                "metrics": to_json(metrics),
                "validation_metrics": to_json(validation_metrics),
                "test_metrics": to_json(test_metrics),
                "feature_names": to_json(feature_names),
                "label_definition": to_json(label_definition),
                "training_data_snapshot": to_json(training_data_snapshot),
                "model_card": to_json(model_card),
            },
        ).scalar_one()
    return str(version_id)


def insert_evaluation(
    *,
    model_version_id: str,
    training_run_id: str,
    model_type: str,
    evaluation_type: str,  # holdout | backtest | baseline
    dataset_split: str,  # validation | test | backtest
    metrics: dict[str, Any],
    cutoff_date: str | None = None,
    horizon_days: int | None = None,
    baseline_name: str | None = None,
    feature_set_id: str | None = None,
    confusion_matrix: dict[str, Any] | None = None,
    calibration: dict[str, Any] | None = None,
    lift_table: list[dict[str, Any]] | None = None,
    feature_importance: list[dict[str, Any]] | None = None,
) -> str:
    with engine().begin() as conn:
        evaluation_id = conn.execute(
            text(
                """
                INSERT INTO ml_model_evaluations (
                  model_version_id, training_run_id, model_type, evaluation_type,
                  dataset_split, cutoff_date, horizon_days, baseline_name,
                  feature_set_id, metrics_json, confusion_matrix_json,
                  calibration_json, lift_table_json, feature_importance_json
                ) VALUES (
                  CAST(:model_version_id AS UUID), CAST(:training_run_id AS UUID),
                  :model_type, :evaluation_type, :dataset_split,
                  CAST(:cutoff_date AS DATE), :horizon_days, :baseline_name,
                  CAST(:feature_set_id AS UUID), CAST(:metrics AS JSONB),
                  CAST(:confusion_matrix AS JSONB), CAST(:calibration AS JSONB),
                  CAST(:lift_table AS JSONB), CAST(:feature_importance AS JSONB)
                )
                RETURNING id::text
                """
            ),
            {
                "model_version_id": model_version_id,
                "training_run_id": training_run_id,
                "model_type": model_type,
                "evaluation_type": evaluation_type,
                "dataset_split": dataset_split,
                "cutoff_date": cutoff_date,
                "horizon_days": horizon_days,
                "baseline_name": baseline_name,
                "feature_set_id": feature_set_id,
                "metrics": to_json(metrics),
                "confusion_matrix": to_json(confusion_matrix) if confusion_matrix else None,
                "calibration": to_json(calibration) if calibration else None,
                "lift_table": to_json(lift_table) if lift_table else None,
                "feature_importance": to_json(feature_importance) if feature_importance else None,
            },
        ).scalar_one()
    return str(evaluation_id)


def current_champion(model_type: str) -> dict[str, Any] | None:
    """Champion version row via the production alias, or None."""

    with engine().connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT v.id::text AS id, v.version, v.artifact_path, v.artifact_checksum,
                       v.model_card_json, v.metrics_json
                FROM ml_model_aliases a
                JOIN ml_model_versions v ON v.id = a.model_version_id
                WHERE a.model_type = :model_type AND a.alias = :alias
                """
            ),
            {"model_type": model_type, "alias": PRODUCTION_ALIAS},
        ).mappings().first()
    return dict(row) if row else None


def version_for_serving(model_type: str, model_version_id: str) -> dict[str, Any] | None:
    """Fetch a specific version row (same shape as `current_champion`) so a
    prediction run can override the production champion for one model type.

    Returns None when the version does not exist, belongs to another model_type,
    or has no artifact — the caller falls back to the production champion.
    """

    with engine().connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT v.id::text AS id, v.version, v.artifact_path, v.artifact_checksum,
                       v.model_card_json, v.metrics_json
                FROM ml_model_versions v
                WHERE v.id = CAST(:version_id AS UUID) AND v.model_type = :model_type
                """
            ),
            {"version_id": model_version_id, "model_type": model_type},
        ).mappings().first()
    if row is None or not row["artifact_path"]:
        return None
    return dict(row)


# ── Production alias: named steps, each on the caller's transaction ─────────


def _lock_model_type(conn: Connection, model_type: str) -> None:
    """Serialize alias changes per model type, so two operators cannot both observe the same
    incumbent and leave alias/is_active out of sync (released at commit)."""
    conn.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:lock_key))"),
        {"lock_key": f"model-promotion:{model_type}"},
    )


def _production_version_id(conn: Connection, model_type: str) -> str | None:
    return conn.execute(
        text(
            """
            SELECT model_version_id::text FROM ml_model_aliases
            WHERE model_type = :model_type AND alias = :alias
            """
        ),
        {"model_type": model_type, "alias": PRODUCTION_ALIAS},
    ).scalar()


def _archive_other_versions(conn: Connection, model_type: str, model_version_id: str) -> None:
    conn.execute(
        text(
            """
            UPDATE ml_model_versions
            SET is_active = FALSE, status = 'archived', deactivated_at = NOW()
            WHERE model_type = :model_type
              AND id != CAST(:version_id AS UUID)
              AND (is_active = TRUE OR status = 'production')
            """
        ),
        {"model_type": model_type, "version_id": model_version_id},
    )


def _mark_production(
    conn: Connection, model_type: str, model_version_id: str, *, keep_activated_at: bool = False
) -> None:
    """Flag a version as production. `keep_activated_at` keeps the first activation time (a repair
    of an already-active version is not a new activation)."""
    activated = "COALESCE(activated_at, NOW())" if keep_activated_at else "NOW()"
    conn.execute(
        text(
            f"""
            UPDATE ml_model_versions
            SET is_active = TRUE, status = 'production',
                activated_at = {activated}, deactivated_at = NULL
            WHERE id = CAST(:version_id AS UUID) AND model_type = :model_type
            """
        ),
        {"version_id": model_version_id, "model_type": model_type},
    )


def _point_production_alias(
    conn: Connection, model_type: str, model_version_id: str, created_by: str | None
) -> None:
    conn.execute(
        text(
            """
            INSERT INTO ml_model_aliases (model_type, alias, model_version_id, created_by)
            VALUES (:model_type, :alias, CAST(:version_id AS UUID), :created_by)
            ON CONFLICT ON CONSTRAINT uq_ml_model_aliases_type_alias
            DO UPDATE SET model_version_id = EXCLUDED.model_version_id,
                          created_by = COALESCE(EXCLUDED.created_by, ml_model_aliases.created_by),
                          updated_at = NOW()
            """
        ),
        {
            "model_type": model_type,
            "alias": PRODUCTION_ALIAS,
            "version_id": model_version_id,
            "created_by": created_by,
        },
    )


def _record_activation(
    conn: Connection,
    *,
    model_type: str,
    previous: str | None,
    new: str | None,
    action: str,
    reason: str,
    created_by: str | None,
) -> None:
    """One ml_model_activation_history row; `previous` / `new` are version ids or None."""
    conn.execute(
        text(
            """
            INSERT INTO ml_model_activation_history (
              model_type, previous_model_version_id, new_model_version_id,
              action, reason, created_by
            ) VALUES (
              :model_type, CAST(:previous AS UUID), CAST(:new AS UUID),
              :action, :reason, :created_by
            )
            """
        ),
        {
            "model_type": model_type,
            "previous": previous,
            "new": new,
            "action": action,
            "reason": reason,
            "created_by": created_by,
        },
    )


def promote_model_version(
    *,
    model_type: str,
    model_version_id: str,
    reason: str,
    created_by: str | None = None,
    action: str = "promote",
) -> None:
    """Point the production alias at a version; archive the previous champion.

    `action` is recorded in ml_model_activation_history — "promote" for the
    training gate's automatic choice, "manual_override" for an operator pinning
    a specific version from the UI.
    """

    with engine().begin() as conn:
        _lock_model_type(conn, model_type)
        target = conn.execute(
            text(
                """
                SELECT id::text, artifact_path
                FROM ml_model_versions
                WHERE id = CAST(:version_id AS UUID) AND model_type = :model_type
                """
            ),
            {"version_id": model_version_id, "model_type": model_type},
        ).mappings().first()
        if target is None:
            raise ValueError(f"No {model_type} model version {model_version_id}")
        if not target["artifact_path"]:
            raise ValueError(f"{model_type} version {model_version_id} has no artifact to activate")

        previous = _production_version_id(conn, model_type)
        # A retry or an operator clicking an already active version is a
        # successful no-op. Do not create a fake activation event with the same
        # version as both previous and new, but do repair status/alias drift.
        already_active = previous == model_version_id
        _archive_other_versions(conn, model_type, model_version_id)
        _mark_production(conn, model_type, model_version_id, keep_activated_at=already_active)
        _point_production_alias(conn, model_type, model_version_id, created_by)
        if not already_active:
            _record_activation(
                conn, model_type=model_type, previous=previous, new=model_version_id,
                action=action, reason=reason, created_by=created_by,
            )


# ── Deleting a Model Version ──────────────────────────────────────


def _lock_deletable_version(conn: Connection, model_type: str, model_version_id: str) -> dict[str, Any]:
    """Lock the version row and refuse the production champion."""
    row = conn.execute(
        text(
            """
            SELECT v.version, v.status, v.is_active, v.artifact_path,
                   EXISTS (
                     SELECT 1
                     FROM ml_model_aliases a
                     WHERE a.model_type = v.model_type
                       AND a.alias = :alias
                       AND a.model_version_id = v.id
                   ) AS is_production_alias
            FROM ml_model_versions v
            WHERE v.id = CAST(:version_id AS UUID) AND v.model_type = :model_type
            FOR UPDATE OF v
            """
        ),
        {"version_id": model_version_id, "model_type": model_type, "alias": PRODUCTION_ALIAS},
    ).mappings().first()

    if row is None:
        raise ValueError(f"No {model_type} model version {model_version_id}")
    if row["is_active"] or row["status"] == "production" or row["is_production_alias"]:
        raise ValueError(
            f"{model_type} version {row['version']} is the production champion — "
            "switch the production model to another version before deleting it"
        )
    return dict(row)


def _ensure_no_prediction_run_uses(
    conn: Connection, model_type: str, version: str, model_version_id: str
) -> None:
    """Prediction runs record the served version string and optional override id."""
    referencing = conn.execute(
        text(
            """
            SELECT id::text AS id, name
            FROM ml_prediction_runs
            WHERE model_versions_json ->> :model_type = :version
               OR model_overrides_json ->> :model_type = :version_id
            ORDER BY created_at DESC
            LIMIT 5
            """
        ),
        {
            "model_type": model_type,
            "version": version,
            "version_id": model_version_id,
        },
    ).mappings().all()

    if referencing:
        names = ", ".join(
            (r["name"] or r["id"][:8]) for r in referencing
        )
        more = "…" if len(referencing) == 5 else ""
        raise ValueError(
            f"Cannot delete {model_type} version {version} — "
            f"still used by prediction run(s): {names}{more}. "
            "Delete those prediction results first."
        )


def _auto_promote_sole_remaining(conn: Connection, model_type: str, created_by: str | None) -> bool:
    """With no production alias left and exactly one version remaining, make it production."""
    has_alias = conn.execute(
        text(
            """
            SELECT 1
            FROM ml_model_aliases
            WHERE model_type = :model_type AND alias = :alias
            LIMIT 1
            """
        ),
        {"model_type": model_type, "alias": PRODUCTION_ALIAS},
    ).first()
    remaining = conn.execute(
        text(
            """
            SELECT id::text AS id, artifact_path
            FROM ml_model_versions
            WHERE model_type = :model_type
            """
        ),
        {"model_type": model_type},
    ).mappings().all()
    if has_alias or len(remaining) != 1 or not remaining[0]["artifact_path"]:
        return False
    replacement_id = remaining[0]["id"]
    _mark_production(conn, model_type, replacement_id)
    # no alias exists here, so the upsert is a plain insert
    _point_production_alias(conn, model_type, replacement_id, created_by)
    _record_activation(
        conn, model_type=model_type, previous=None, new=replacement_id, action="auto_promote",
        reason="Auto-promoted the only remaining model version after deletion", created_by=created_by,
    )
    return True


def _remove_artifact_dir(artifact_path: str | None) -> bool:
    import shutil

    from src.training.artifacts import models_dir

    if not artifact_path:
        return False
    target = Path(artifact_path)
    if not target.is_absolute():
        target = models_dir() / target
    if not target.exists():
        return False
    shutil.rmtree(target, ignore_errors=True)
    return True


def delete_model_version(
    *,
    model_type: str,
    model_version_id: str,
    created_by: str | None = None,
    auto_promote_sole_remaining: bool = True,
) -> dict[str, Any]:
    """Permanently delete a non-production model version (artifacts + DB row).

    Guardrails:
      - the version must exist and belong to `model_type`;
      - the current production champion (is_active / status='production') can
        NEVER be deleted — switch champion first;
      - any prediction run that served this version (model_versions_json by
        version string, or model_overrides_json by version id) blocks delete
        until those prediction runs are removed.

    Checks and deletes the `ml_model_versions` row in one transaction (the row is
    locked, so a concurrent promotion can't slip in between), then removes the
    on-disk artifact directory once the delete has committed. FK cascades clean up `ml_model_evaluations` and
    `ml_model_aliases`; `ml_model_activation_history` rows are kept with their
    version references set to NULL (audit trail survives).
    """

    with engine().begin() as conn:
        row = _lock_deletable_version(conn, model_type, model_version_id)
        _ensure_no_prediction_run_uses(conn, model_type, row["version"], model_version_id)
        # Audit the deletion BEFORE removing the row. The version id is kept in
        # `reason` text (not the FK columns, which ON DELETE SET NULL would clear)
        # so the trail survives the row deletion.
        _record_activation(
            conn, model_type=model_type, previous=None, new=None, action="delete",
            reason=(
                f"Deleted {model_type} version {row['version']} "
                f"(id={model_version_id}, artifact_path={row['artifact_path']})"
            ),
            created_by=created_by,
        )
        conn.execute(
            text("DELETE FROM ml_model_versions WHERE id = CAST(:version_id AS UUID)"),
            {"version_id": model_version_id},
        )
        auto_promoted = auto_promote_sole_remaining and _auto_promote_sole_remaining(conn, model_type, created_by)

    # Only now that the row is gone: a failed delete never leaves a row pointing at nothing.
    return {
        "model_type": model_type,
        "version": row["version"],
        "model_version_id": model_version_id,
        "artifact_removed": _remove_artifact_dir(row["artifact_path"]),
        "auto_promoted_sole_remaining": auto_promoted,
    }


def clear_production_champion(
    *,
    model_type: str,
    reason: str,
    created_by: str | None = None,
    expected_version_id: str | None = None,
) -> None:
    """Remove the production alias when no replacement version exists.

    Archives the incumbent champion (if any) and records the change in
    ml_model_activation_history. Used when deleting the only production
    version for a model type and no prediction runs still reference it.
    """

    with engine().begin() as conn:
        _lock_model_type(conn, model_type)
        previous = _production_version_id(conn, model_type)
        if previous is None:
            return
        if expected_version_id is not None and previous != expected_version_id:
            raise ValueError(
                f"Production champion for {model_type} changed before clear "
                f"(expected {expected_version_id}, found {previous})"
            )

        conn.execute(
            text(
                """
                UPDATE ml_model_versions
                SET is_active = FALSE, status = 'archived', deactivated_at = NOW()
                WHERE id = CAST(:version_id AS UUID) AND model_type = :model_type
                """
            ),
            {"version_id": previous, "model_type": model_type},
        )
        conn.execute(
            text(
                """
                DELETE FROM ml_model_aliases
                WHERE model_type = :model_type AND alias = :alias
                """
            ),
            {"model_type": model_type, "alias": PRODUCTION_ALIAS},
        )
        _record_activation(
            conn, model_type=model_type, previous=previous, new=None, action="clear_production",
            reason=reason, created_by=created_by,
        )


# ── Deleting a Training Run: move production off its versions first ──────────


def _production_versions_of_run(training_run_id: str) -> list[dict[str, Any]]:
    with engine().connect() as conn:
        return [
            dict(r)
            for r in conn.execute(
                text(
                    """
                    SELECT v.id::text AS id, v.model_type, v.version
                    FROM ml_model_versions v
                    JOIN ml_model_aliases a
                      ON a.model_version_id = v.id
                     AND a.model_type = v.model_type
                     AND a.alias = :alias
                    WHERE v.training_run_id = CAST(:run_id AS UUID)
                    """
                ),
                {"run_id": training_run_id, "alias": PRODUCTION_ALIAS},
            ).mappings().all()
        ]


def _newest_version_outside_run(model_type: str, training_run_id: str) -> dict[str, Any] | None:
    with engine().connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id::text AS id, version
                FROM ml_model_versions
                WHERE model_type = :model_type
                  AND training_run_id != CAST(:run_id AS UUID)
                  AND artifact_path IS NOT NULL
                ORDER BY trained_at DESC NULLS LAST, created_at DESC
                LIMIT 1
                """
            ),
            {"model_type": model_type, "run_id": training_run_id},
        ).mappings().first()
    return dict(row) if row else None


def repoint_production_away_from_training_run(
    *,
    training_run_id: str,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Move production off champions owned by a training run before deleting it.

    Call only after confirming no prediction runs reference versions from this
    run. For each model type whose production alias points at a version in the
    run, promote the newest remaining version outside the run; if none exists,
    clear production so prediction will skip that model until retrain.
    """

    repointed: list[dict[str, str]] = []
    cleared: list[dict[str, str]] = []

    for champ in _production_versions_of_run(training_run_id):
        model_type = champ["model_type"]
        replacement = _newest_version_outside_run(model_type, training_run_id)
        if replacement:
            promote_model_version(
                model_type=model_type,
                model_version_id=replacement["id"],
                reason=(
                    f"Auto-repointed from {champ['version']} before deleting "
                    f"training run {training_run_id}"
                ),
                created_by=created_by,
                action="auto_repoint",
            )
            repointed.append(
                {"model_type": model_type, "from_version": champ["version"], "to_version": replacement["version"]}
            )
        else:
            clear_production_champion(
                model_type=model_type,
                reason=(
                    f"Cleared production {champ['version']} — no other version exists "
                    f"before deleting training run {training_run_id}"
                ),
                created_by=created_by,
                expected_version_id=champ["id"],
            )
            cleared.append({"model_type": model_type, "from_version": champ["version"]})

    # Archive any of the run's versions still flagged production.
    with engine().begin() as conn:
        conn.execute(
            text(
                """
                UPDATE ml_model_versions
                SET is_active = FALSE, status = 'archived', deactivated_at = NOW()
                WHERE training_run_id = CAST(:run_id AS UUID)
                  AND (is_active = TRUE OR status = 'production')
                """
            ),
            {"run_id": training_run_id},
        )

    return {"repointed": repointed, "cleared": cleared}


def activate_model_version(
    *,
    model_type: str,
    model_version_id: str,
    reason: str | None = None,
    created_by: str | None = None,
) -> dict[str, Any]:
    """Manually pin a specific version to the production alias (UI override).

    Validates the version exists, belongs to model_type, and has an artifact,
    then reuses the same promotion transaction with action='manual_override'.
    """

    with engine().connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT version, status, artifact_path
                FROM ml_model_versions
                WHERE id = CAST(:version_id AS UUID) AND model_type = :model_type
                """
            ),
            {"version_id": model_version_id, "model_type": model_type},
        ).mappings().first()

    if row is None:
        raise ValueError(f"No {model_type} model version {model_version_id}")
    if not row["artifact_path"]:
        raise ValueError(f"{model_type} version {row['version']} has no artifact to activate")

    promote_model_version(
        model_type=model_type,
        model_version_id=model_version_id,
        reason=reason or f"Manual override to {row['version']}",
        created_by=created_by,
        action="manual_override",
    )
    return {"model_type": model_type, "version": row["version"], "model_version_id": model_version_id}


# ── Training run lifecycle ───────────────────────────────────────
