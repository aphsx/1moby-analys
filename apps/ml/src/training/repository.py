"""Persistence helpers for ML training validation artifacts."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text

from src.db import engine, to_json
from src.training.features import FeatureSetContract
from src.training.validation import ValidationReport


def save_validation_report(
    report: ValidationReport,
    *,
    training_run_id: str | None = None,
    prediction_run_id: str | None = None,
) -> str:
    """Persist a validation report to `ml_data_validation_reports`.

    The report object stays independent from persistence so validation can run
    read-only during local checks and tests.
    """

    row = report.to_validation_report_row()
    with engine().begin() as conn:
        report_id = conn.execute(
            text(
                """
                INSERT INTO ml_data_validation_reports (
                  source_id,
                  source_kind,
                  training_run_id,
                  prediction_run_id,
                  validation_type,
                  status,
                  row_count,
                  stats_json,
                  anomalies_json,
                  drift_json
                )
                VALUES (
                  CAST(:source_id AS UUID),
                  :source_kind,
                  CAST(:training_run_id AS UUID),
                  CAST(:prediction_run_id AS UUID),
                  :validation_type,
                  :status,
                  :row_count,
                  CAST(:stats_json AS JSONB),
                  CAST(:anomalies_json AS JSONB),
                  CAST(:drift_json AS JSONB)
                )
                RETURNING id::text
                """
            ),
            {
                "source_id": row["source_id"],
                "source_kind": row["source_kind"],
                "training_run_id": training_run_id,
                "prediction_run_id": prediction_run_id,
                "validation_type": row["validation_type"],
                "status": row["status"],
                "row_count": row["row_count"],
                "stats_json": to_json(row["stats_json"]),
                "anomalies_json": to_json(row["anomalies_json"]),
                "drift_json": to_json(row["drift_json"]),
            },
        ).scalar_one()

    return str(report_id)


def save_validation_reports(
    reports: list[ValidationReport],
    *,
    training_run_id: str | None = None,
    prediction_run_id: str | None = None,
) -> list[str]:
    return [
        save_validation_report(
            report,
            training_run_id=training_run_id,
            prediction_run_id=prediction_run_id,
        )
        for report in reports
    ]


def save_feature_set_contract(contract: FeatureSetContract) -> str:
    """Persist a feature set contract to `ml_feature_sets`.

    Upsert keeps repeated verification runs idempotent for the same
    name/version/model_type tuple.
    """

    with engine().begin() as conn:
        feature_set_id = conn.execute(
            text(
                """
                INSERT INTO ml_feature_sets (
                  name,
                  version,
                  model_type,
                  feature_names_json,
                  feature_schema_json,
                  transform_config_json,
                  feature_code_hash,
                  status
                )
                VALUES (
                  :name,
                  :version,
                  :model_type,
                  CAST(:feature_names_json AS JSONB),
                  CAST(:feature_schema_json AS JSONB),
                  CAST(:transform_config_json AS JSONB),
                  :feature_code_hash,
                  :status
                )
                ON CONFLICT ON CONSTRAINT uq_ml_feature_sets_name_version_type
                DO UPDATE SET
                  feature_names_json = EXCLUDED.feature_names_json,
                  feature_schema_json = EXCLUDED.feature_schema_json,
                  transform_config_json = EXCLUDED.transform_config_json,
                  feature_code_hash = EXCLUDED.feature_code_hash,
                  status = EXCLUDED.status
                RETURNING id::text
                """
            ),
            {
                "name": contract.name,
                "version": contract.version,
                "model_type": contract.model_type,
                "feature_names_json": to_json(contract.feature_names),
                "feature_schema_json": to_json(contract.feature_schema),
                "transform_config_json": to_json(contract.transform_config),
                "feature_code_hash": contract.feature_code_hash,
                "status": contract.status,
            },
        ).scalar_one()

    return str(feature_set_id)


