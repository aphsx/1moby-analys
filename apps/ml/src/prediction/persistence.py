"""Writing a Prediction Run: one output row per customer (OUTPUT_COLUMNS), the post-write check,
the run row, and the scalar coercions the rows need.
"""

from __future__ import annotations

import json
import math
from typing import Any

import numpy as np
import pandas as pd
from sqlalchemy import text

from src.constants import OutputStatus
from src.db import PREDICTION_RUNS, engine, load_run, update_run


INSERT_CHUNK = 1000


def build_output_rows(
    prediction_run_id: str,
    frame: pd.DataFrame,
    model_versions: dict[str, str],
    major_drift_models: set[str] | None = None,
) -> list[dict[str, Any]]:
    major_drift_models = major_drift_models or set()
    _eligibility_col_map = {"churn": "el_churn", "clv": "el_clv", "credit": "el_credit"}
    model_versions_json = json.dumps(model_versions, ensure_ascii=False)
    rows: list[dict[str, Any]] = []
    # records iteration instead of iterrows() — same values, no per-row Series.
    for row in frame.to_dict("records"):
        eligibility = _eligibility_json(row)
        eligibility_dict = json.loads(eligibility)

        predicted_models = [
            model
            for model in eligibility_dict.values()
            if model["status"] == "predicted"
        ]
        eligible_unpredicted_models = [
            model
            for model in eligibility_dict.values()
            if model["eligible"] and model["status"] != "predicted"
        ]
        # Major PSI drift on a model that processed this customer → downgrade to PARTIAL
        # so downstream consumers know predictions may be unreliable.
        customer_drift_models = [
            mt
            for mt in major_drift_models
            if bool(row.get(_eligibility_col_map.get(mt, ""), False))
        ]
        has_major_drift = bool(customer_drift_models)

        if not predicted_models:
            output_status = OutputStatus.INSUFFICIENT_DATA
        elif eligible_unpredicted_models or has_major_drift:
            output_status = OutputStatus.PARTIAL
        else:
            output_status = OutputStatus.PREDICTED
        base_notes = _output_notes(eligibility_dict)
        drift_notes = [
            f"{mt}: major feature drift detected (PSI > 0.25) — predictions may be unreliable"
            for mt in sorted(customer_drift_models)
        ]
        all_note_parts = [
            n for n in ([base_notes] if base_notes else []) + drift_notes if n
        ]
        output_notes = "; ".join(all_note_parts) if all_note_parts else None

        interval = None
        if not pd.isna(row["credit_p10_30d"]):
            interval = json.dumps(
                {
                    "p10_30d": round(float(row["credit_p10_30d"]), 2),
                    "p90_30d": round(float(row["credit_p90_30d"]), 2),
                    "p10_90d": round(float(row["credit_p10_90d"]), 2),
                    "p90_90d": round(float(row["credit_p90_90d"]), 2),
                }
            )
        rows.append(
            {
                "prediction_run_id": prediction_run_id,
                "acc_id": int(row["acc_id"]),
                "lifecycle_stage": str_or_none(row["lifecycle_stage"]),
                "sub_stage": str_or_none(row["sub_stage"]),
                "churn_probability": round_or_none(row["churn_probability"], 4),
                "churn_risk_level": str_or_none(row["churn_risk_level"]),
                "churn_factors_json": json.dumps(
                    row["churn_factors"], ensure_ascii=False
                )
                if row["churn_factors"] is not None
                else None,
                "predicted_clv_6m": round_or_none(row["predicted_clv_6m"], 2),
                "clv_pay_probability": round_or_none(row.get("clv_pay_probability"), 4),
                "clv_forecast_interval_json": json.dumps(row["clv_forecast_interval"])
                if row.get("clv_forecast_interval") is not None
                else None,
                "p_alive": round_or_none(row["p_alive"], 4),
                "customer_value_tier": str_or_none(row["customer_value_tier"]),
                "revenue_at_risk": round_or_none(row["revenue_at_risk"], 2),
                "predicted_credit_usage_30d": round_or_none(
                    row["predicted_credit_usage_30d"], 2
                ),
                "predicted_credit_usage_90d": round_or_none(
                    row["predicted_credit_usage_90d"], 2
                ),
                "credit_forecast_interval_json": interval,
                "estimated_days_until_topup": int_or_none(
                    row["estimated_days_until_topup"]
                ),
                "credit_urgency_level": str_or_none(row["credit_urgency_level"]),
                "usage_trend": str_or_none(row["usage_trend"]),
                "days_since_last_activity": int_or_none(
                    row["days_since_last_activity"]
                ),
                "n_purchases": int(row["n_purchases"]),
                "total_revenue": round_or_none(row["total_revenue"], 2) or 0.0,
                "avg_transaction_value": round_or_none(
                    row["avg_transaction_value"], 2
                ),
                "ever_paid": bool(row["ever_paid"]),
                "priority_score": round_or_none(row["priority_score"], 2) or 0.0,
                "segment": str_or_none(row.get("segment")),
                "priority_rank": int_or_none(row.get("priority_rank")),
                "needs_review": bool(row.get("needs_review", False)),
                "output_status": output_status,
                "output_notes": output_notes,
                "model_eligibility_json": eligibility,
                "model_versions_json": model_versions_json,
                "profile_snapshot_json": json.dumps(
                    row["profile_snapshot"], ensure_ascii=False
                ),
            }
        )
    return rows


def _eligibility_json(row: dict[str, Any]) -> str:
    stage = row["lifecycle_stage"]
    churn_reason = {
        "Active Paid": ("eligible", "ลูกค้า Active Paid"),
        "Active Free": ("not_eligible", "never_paid — ไม่เคยจ่ายเงิน ไม่เข้านิยาม churn"),
        "Churned": ("not_eligible", "already_churned — churn ไปแล้ว ไม่ต้องทำนาย"),
        "Ghost": ("not_eligible", "no_history — ไม่มีประวัติพอจะทำนาย"),
    }[stage]
    clv_reason = {
        "Active Paid": ("eligible", "ลูกค้า active"),
        "Active Free": ("eligible", "ทำนายโอกาสเริ่มจ่าย"),
        "Churned": ("not_eligible", "inactive — ไม่ active แล้ว"),
        "Ghost": ("not_eligible", "no_history — ไม่มีประวัติ"),
    }[stage]
    credit_reason = {
        "Active Paid": ("eligible", "มีประวัติใช้งาน"),
        "Active Free": ("eligible", "มีประวัติใช้งาน"),
        "Churned": ("not_eligible", "inactive — ไม่ active แล้ว"),
        "Ghost": ("not_eligible", "no_history — ไม่มีประวัติ"),
    }[stage]

    def block(status_reason: tuple[str, str], predicted_value: Any) -> dict[str, Any]:
        status, reason = status_reason
        eligible = status == "eligible"
        if (
            eligible
            and predicted_value is not None
            and not (isinstance(predicted_value, float) and math.isnan(predicted_value))
        ):
            return {"eligible": True, "status": "predicted", "reason": reason}
        if eligible:
            return {
                "eligible": True,
                "status": "insufficient_data",
                "reason": "ข้อมูลไม่พอประเมิน",
            }
        return {"eligible": False, "status": "not_eligible", "reason": reason}

    def churn_block() -> dict[str, Any]:
        # Abstention: eligible by stage, but too little history to trust — say so
        # explicitly instead of the generic "insufficient data" message.
        if bool(row.get("churn_abstained")):
            return {
                "eligible": True,
                "status": "insufficient_data",
                "reason": "insufficient_history — อายุลูกค้าสั้นกว่า 90 วัน feature ยังไม่พอ งดประเมิน churn (abstain)",
            }
        return block(churn_reason, row["churn_probability"])

    return json.dumps(
        {
            "churn": churn_block(),
            "clv": block(clv_reason, row["predicted_clv_6m"]),
            "credit": block(credit_reason, row["predicted_credit_usage_30d"]),
        },
        ensure_ascii=False,
    )


def _output_notes(eligibility: dict[str, Any]) -> str | None:
    notes = [
        f"{model_type}: {model['reason']}"
        for model_type, model in eligibility.items()
        if not model["eligible"]
    ]
    return "; ".join(notes) if notes else None


OUTPUT_COLUMNS = [
    "prediction_run_id",
    "acc_id",
    "lifecycle_stage",
    "sub_stage",
    "churn_probability",
    "churn_risk_level",
    "churn_factors_json",
    "predicted_clv_6m",
    "clv_pay_probability",
    "clv_forecast_interval_json",
    "p_alive",
    "customer_value_tier",
    "revenue_at_risk",
    "predicted_credit_usage_30d",
    "predicted_credit_usage_90d",
    "credit_forecast_interval_json",
    "estimated_days_until_topup",
    "credit_urgency_level",
    "usage_trend",
    "days_since_last_activity",
    "n_purchases",
    "total_revenue",
    "avg_transaction_value",
    "ever_paid",
    "priority_score",
    "segment",
    "priority_rank",
    "needs_review",
    "output_status",
    "output_notes",
    "model_eligibility_json",
    "model_versions_json",
    "profile_snapshot_json",
]


def delete_outputs(prediction_run_id: str) -> None:
    with engine().begin() as conn:
        conn.execute(
            text("DELETE FROM ml_prediction_outputs WHERE prediction_run_id = CAST(:run_id AS UUID)"),
            {"run_id": prediction_run_id},
        )


def replace_outputs(prediction_run_id: str, rows: list[dict[str, Any]]) -> None:
    # Contract guard: every key built per row must be persisted, and every
    # persisted column must be built. This catches the silent class of bug where
    # a derived field (e.g. segment/priority_rank/needs_review) is computed but
    # missing from OUTPUT_COLUMNS, so it never reaches the table.
    if rows:
        produced = set(rows[0].keys())
        declared = set(OUTPUT_COLUMNS)
        missing = sorted(declared - produced)
        dropped = sorted(produced - declared)
        if missing or dropped:
            raise RuntimeError(
                "Output column contract drift — "
                f"declared but not produced: {missing}; "
                f"produced but not persisted: {dropped}"
            )
    placeholders = ", ".join(
        f":{column}"
        if column
        not in (
            "prediction_run_id",
            "churn_factors_json",
            "clv_forecast_interval_json",
            "credit_forecast_interval_json",
            "model_eligibility_json",
            "model_versions_json",
            "profile_snapshot_json",
        )
        else {
            "prediction_run_id": "CAST(:prediction_run_id AS UUID)",
            "churn_factors_json": "CAST(:churn_factors_json AS JSONB)",
            "clv_forecast_interval_json": "CAST(:clv_forecast_interval_json AS JSONB)",
            "credit_forecast_interval_json": "CAST(:credit_forecast_interval_json AS JSONB)",
            "model_eligibility_json": "CAST(:model_eligibility_json AS JSONB)",
            "model_versions_json": "CAST(:model_versions_json AS JSONB)",
            "profile_snapshot_json": "CAST(:profile_snapshot_json AS JSONB)",
        }[column]
        for column in OUTPUT_COLUMNS
    )
    upsert_set = ", ".join(
        f"{col} = EXCLUDED.{col}"
        for col in OUTPUT_COLUMNS
        if col not in ("prediction_run_id", "acc_id")
    )
    insert_sql = text(
        f"INSERT INTO ml_prediction_outputs ({', '.join(OUTPUT_COLUMNS)}) VALUES ({placeholders})"
        f" ON CONFLICT (prediction_run_id, acc_id) DO UPDATE SET {upsert_set}"
    )
    with engine().begin() as conn:
        conn.execute(
            text(
                "DELETE FROM ml_prediction_outputs WHERE prediction_run_id = CAST(:id AS UUID)"
            ),
            {"id": prediction_run_id},
        )
        for start in range(0, len(rows), INSERT_CHUNK):
            conn.execute(insert_sql, rows[start : start + INSERT_CHUNK])


def run_post_check(prediction_run_id: str, frame: pd.DataFrame) -> dict[str, Any]:
    with engine().connect() as conn:
        inserted = conn.execute(
            text(
                "SELECT count(*) FROM ml_prediction_outputs WHERE prediction_run_id = CAST(:id AS UUID)"
            ),
            {"id": prediction_run_id},
        ).scalar_one()
        out_of_range = conn.execute(
            text(
                """
                SELECT count(*) FROM ml_prediction_outputs
                WHERE prediction_run_id = CAST(:id AS UUID)
                  AND (churn_probability < 0 OR churn_probability > 1
                       OR p_alive < 0 OR p_alive > 1)
                """
            ),
            {"id": prediction_run_id},
        ).scalar_one()

    eligible_churn = int(frame["el_churn"].sum())
    abstained_series = (
        frame["churn_abstained"].astype(bool)
        if "churn_abstained" in frame.columns
        else pd.Series(False, index=frame.index)
    )
    abstained_churn = int((frame["el_churn"] & abstained_series).sum())
    # Only customers we actually attempted to score (eligible AND not abstained)
    # should have a churn probability. Abstention nulls are intentional (thin
    # history) and are surfaced via model_eligibility.churn=insufficient_data,
    # so they are excluded from this "unexpected null" bug gate.
    scored_mask = frame["el_churn"] & ~abstained_series
    scored_churn = int(scored_mask.sum())
    churn_nulls_in_scored = int(frame.loc[scored_mask, "churn_probability"].isna().sum())
    failures: list[str] = []
    if inserted != len(frame):
        failures.append(f"row count {inserted} != customers {len(frame)}")
    if out_of_range > 0:
        failures.append(f"{out_of_range} rows with scores outside [0,1]")
    if scored_churn > 0 and churn_nulls_in_scored / scored_churn > 0.01:
        failures.append(
            f"churn null rate among scored (non-abstained) eligible too high "
            f"({churn_nulls_in_scored}/{scored_churn})"
        )
    return {
        "passed": not failures,
        "failures": failures,
        "stats": {
            "rows_inserted": int(inserted),
            "customers": int(len(frame)),
            "eligible_churn": eligible_churn,
            "abstained_churn": abstained_churn,
            "scored_churn": scored_churn,
            "churn_nulls_in_scored": churn_nulls_in_scored,
        },
    }


def save_postcheck_report(
    prediction_run_id: str,
    source_id: str,
    post_check: dict[str, Any],
) -> None:
    with engine().begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO ml_data_validation_reports (
                  source_id, source_kind, prediction_run_id, validation_type,
                  status, row_count, stats_json, anomalies_json
                ) VALUES (
                  CAST(:source_id AS UUID), 'predict', CAST(:prediction_run_id AS UUID),
                  'output_postcheck', :status, :row_count,
                  CAST(:stats AS JSONB), CAST(:anomalies AS JSONB)
                )
                """
            ),
            {
                "source_id": source_id,
                "prediction_run_id": prediction_run_id,
                "status": "passed" if post_check["passed"] else "failed",
                "row_count": post_check["stats"]["rows_inserted"],
                "stats": json.dumps(post_check["stats"]),
                "anomalies": json.dumps(
                    [{"message": failure} for failure in post_check["failures"]]
                ),
            },
        )


def load_prediction_run(prediction_run_id: str) -> dict[str, Any]:
    return load_run(
        PREDICTION_RUNS,
        prediction_run_id,
        "id::text, predict_source_id::text, status, cutoff_date, created_by, model_overrides_json",
    )


def update_prediction_run(prediction_run_id: str, **fields: Any) -> None:
    update_run(PREDICTION_RUNS, prediction_run_id, **fields)


def round_or_none(value: Any, digits: int) -> float | None:
    if (
        value is None
        or (isinstance(value, float) and math.isnan(value))
        or pd.isna(value)
    ):
        return None
    return round(float(value), digits)


def int_or_none(value: Any) -> int | None:
    if value is None or pd.isna(value):
        return None
    return int(value)


def str_or_none(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    return str(value)


def float_or_zero(value: Any) -> float:
    if value is None or pd.isna(value):
        return 0.0
    return float(value)


def date_or_none(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    return str(pd.Timestamp(value).date())


def json_scalar(value: Any) -> Any:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, (np.floating, np.integer)):
        return (
            round(value.item(), 4) if isinstance(value, np.floating) else value.item()
        )
    if isinstance(value, float):
        return round(value, 4)
    return value
