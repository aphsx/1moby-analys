import { describe, expect, test } from "bun:test";
import { validateTextToSql } from "./sql-guard";

const check = (sql: string) => validateTextToSql(sql, "admin");

describe("validateTextToSql", () => {
  test("accepts a modeled SELECT and applies the default LIMIT", () => {
    const result = check(
      "SELECT acc_id, churn_probability FROM ml_prediction_outputs WHERE churn_probability > 0.5"
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql).toEndWith("LIMIT 50");
  });

  test("caps an oversized LIMIT", () => {
    const result = check("SELECT acc_id FROM ml_prediction_outputs LIMIT 5000");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sql).toContain("LIMIT 100");
  });

  test.each([
    ["a write", "DELETE FROM ml_prediction_outputs"],
    ["a second statement", "SELECT acc_id FROM ml_prediction_outputs; DROP TABLE ml_prediction_outputs"],
    ["a blocked token inside a SELECT", "SELECT acc_id FROM ml_prediction_outputs WHERE acc_id IN (SELECT 1) FOR UPDATE"],
    ["SELECT *", "SELECT * FROM ml_prediction_outputs"],
    ["an unmodeled table", 'SELECT id FROM "user"'],
    ["an unmodeled column", "SELECT password FROM ml_prediction_outputs"],
    ["an unknown function", "SELECT pg_sleep(10) FROM ml_prediction_outputs"],
    ["a dollar-quoted block", "SELECT $$x$$ FROM ml_prediction_outputs"],
  ])("rejects %s", (_label, sql) => {
    expect(check(sql).ok).toBe(false);
  });
});
