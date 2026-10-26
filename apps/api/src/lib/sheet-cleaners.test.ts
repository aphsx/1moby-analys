import { describe, expect, test } from "bun:test";
import { mapPaymentRow, mapUsageRow, mapUserRow } from "./sheet-cleaners";
import { parseCellDateOnly, parseCellInt, parseCellNumeric, parseCellString } from "./train-clean-cell";

const SOURCE = "source-1";
const raw = (payload: Record<string, unknown>) => ({ excelRow: 2, rawRowId: 1, payload });

describe("cell parsers", () => {
  test("blank and junk cells become null", () => {
    expect(parseCellString("   ")).toBeNull();
    expect(parseCellInt("abc")).toBeNull();
    expect(parseCellNumeric("n/a")).toBeNull();
    expect(parseCellDateOnly("not a date")).toBeNull();
  });

  test("numbers are normalized", () => {
    expect(parseCellInt(" 12.7 ")).toBe(12);
    expect(parseCellNumeric("1e3")).toBe("1000");
  });

  test("Excel serial dates map to calendar dates", () => {
    expect(parseCellDateOnly(45000)).toBe("2023-03-15");
    expect(parseCellDateOnly({ _excel: true, serial: 45000 })).toBe("2023-03-15");
    expect(parseCellDateOnly({ _excel: true, iso: "2024-01-31T00:00:00.000Z" })).toBe("2024-01-31");
  });
});

describe("sheet row mappers", () => {
  test("rows without an acc_id are skipped with a reason", () => {
    expect(mapUserRow(raw({}), SOURCE)).toEqual({ ok: false, reason: "customers_no_acc_id" });
    expect(mapPaymentRow(raw({ payment_date: 45000 }), SOURCE)).toEqual({ ok: false, reason: "payments_no_acc_id" });
    expect(mapUsageRow(raw({}), SOURCE, "sms", "bc")).toEqual({ ok: false, reason: "usage_no_acc_id" });
  });

  test("payments without a date are skipped", () => {
    expect(mapPaymentRow(raw({ acc_id: 7 }), SOURCE)).toEqual({ ok: false, reason: "payments_no_date" });
  });

  test("missing credit defaults to zero", () => {
    const result = mapUserRow(raw({ acc_id: "7" }), SOURCE);
    expect(result.ok && result.value.creditSms).toBe("0");
    expect(result.ok && result.value.accId).toBe(7);
  });

  test("an out-of-range usage month is kept with a warning", () => {
    const result = mapUsageRow(raw({ acc_id: 7, year: 2024, month: 13, usage: 5 }), SOURCE, "sms", "bc");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings).toHaveLength(1);
  });
});
