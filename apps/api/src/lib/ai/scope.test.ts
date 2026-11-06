import { describe, expect, test } from "bun:test";
import { enforceScope, type UserScope } from "./scope";

const RUN_A = "11111111-1111-4111-8111-111111111111";
const RUN_B = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const UNKNOWN = "99999999-9999-4999-8999-999999999999";
const scope: UserScope = { runIds: [RUN_A, RUN_B], sourceIds: [SOURCE] };

const outputsFor = (id: string) =>
  `SELECT acc_id FROM ml_prediction_outputs WHERE prediction_run_id = '${id}'`;

describe("enforceScope", () => {
  test("allows queries that touch no scoped table", () => {
    expect(enforceScope("SELECT 1", scope, null).ok).toBe(true);
  });

  test("allows a run-scoped query filtered by a known run", () => {
    expect(enforceScope(outputsFor(RUN_A), scope, null).ok).toBe(true);
  });

  test("rejects a run-scoped query with no run filter", () => {
    expect(enforceScope("SELECT acc_id FROM ml_prediction_outputs", scope, null).ok).toBe(false);
  });

  test("rejects an unknown id", () => {
    expect(enforceScope(outputsFor(UNKNOWN), scope, null).ok).toBe(false);
  });

  test("a bound conversation only reads its own run", () => {
    expect(enforceScope(outputsFor(RUN_A), scope, RUN_A).ok).toBe(true);
    expect(enforceScope(outputsFor(RUN_B), scope, RUN_A).ok).toBe(false);
  });

  test("source-scoped tables need a known source id", () => {
    expect(
      enforceScope(`SELECT acc_id FROM predict_clean_customers WHERE source_id = '${SOURCE}'`, scope, null).ok
    ).toBe(true);
    expect(enforceScope("SELECT acc_id FROM predict_clean_customers", scope, null).ok).toBe(false);
  });
});
