import { describe, expect, test } from "bun:test";
import type { RawRowInput } from "../src/lib/sheet-cleaners";
import {
  emptySkippedCounts,
  mapPaymentRow,
  mapUsageRow,
  mapUserRow,
} from "../src/lib/sheet-cleaners";

function raw(
  payload: Record<string, unknown>,
  excelRow = 2,
  rawRowId = 1
): RawRowInput {
  return { excelRow, payload, rawRowId };
}

describe("emptySkippedCounts", () => {
  test("all reasons start at zero", () => {
    expect(emptySkippedCounts()).toEqual({
      customers_no_acc_id: 0,
      payments_no_acc_id: 0,
      payments_no_date: 0,
      usage_no_acc_id: 0,
    });
  });
});

describe("mapUserRow", () => {
  test("skips rows without acc_id", () => {
    const result = mapUserRow(raw({}), "source-1");
    expect(result).toEqual({ ok: false, reason: "customers_no_acc_id" });
  });

  test("maps a full row, preferring the composite credit_sms key", () => {
    const result = mapUserRow(
      raw({
        acc_id: "123",
        credit_email: "10",
        credit_sms: "999",
        expire: "2026-12-31",
        expire_email: "2026-11-30",
        join_date: "2025-01-01",
        last_access: "2026-07-01T00:00:00.000Z",
        last_send: "2026-07-05T00:00:00.000Z",
        "status (Email)": "inactive",
        "status (SMS)": "active",
        "user.credit + user.credit_premium": "50",
      }),
      "source-1"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.accId).toBe(123);
    expect(result.value.creditSms).toBe("50");
    expect(result.value.creditEmail).toBe("10");
    expect(result.value.statusSms).toBe("active");
    expect(result.value.statusEmail).toBe("inactive");
    expect(result.value.expireSms).toBe("2026-12-31");
    expect(result.value.joinDate).toBe("2025-01-01");
  });

  test("falls back to snake_case status/credit keys when spaced keys are absent", () => {
    const result = mapUserRow(
      raw({
        acc_id: "1",
        credit_sms: "5",
        status_email: "active",
        status_sms: "active",
      }),
      "source-1"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.statusSms).toBe("active");
    expect(result.value.statusEmail).toBe("active");
    expect(result.value.creditSms).toBe("5");
  });

  test("defaults missing credit fields to zero string", () => {
    const result = mapUserRow(raw({ acc_id: "1" }), "source-1");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.creditSms).toBe("0");
    expect(result.value.creditEmail).toBe("0");
  });
});

describe("mapPaymentRow", () => {
  test("skips rows without acc_id", () => {
    expect(
      mapPaymentRow(raw({ payment_date: "2026-01-01" }), "source-1")
    ).toEqual({
      ok: false,
      reason: "payments_no_acc_id",
    });
  });

  test("skips rows without a parseable payment_date", () => {
    expect(mapPaymentRow(raw({ acc_id: "1" }), "source-1")).toEqual({
      ok: false,
      reason: "payments_no_date",
    });
  });

  test("maps a full payment row", () => {
    const result = mapPaymentRow(
      raw({
        acc_id: "1",
        amount: "100.5",
        credit_add: "50",
        credit_type: "topup",
        payment_date: "2026-01-05",
        uid: "9",
      }),
      "source-1"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.accId).toBe(1);
    expect(result.value.paymentUid).toBe(9);
    expect(result.value.paymentDate.toISOString().slice(0, 10)).toBe(
      "2026-01-05"
    );
    expect(result.value.amount).toBe("100.5");
    expect(result.value.creditAdd).toBe("50");
    expect(result.value.creditType).toBe("topup");
  });
});

describe("mapUsageRow", () => {
  test("skips rows without acc_id", () => {
    expect(mapUsageRow(raw({}), "source-1", "SMS", "BC")).toEqual({
      ok: false,
      reason: "usage_no_acc_id",
    });
  });

  test("maps a valid usage row with no warnings", () => {
    const result = mapUsageRow(
      raw({ acc_id: "1", month: "6", usage: "42", year: "2026" }),
      "source-1",
      "SMS",
      "BC"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toMatchObject({
      accId: 1,
      channel: "SMS",
      month: 6,
      usage: "42",
      usageSource: "BC",
      year: 2026,
    });
    expect(result.warnings).toBeUndefined();
  });

  test("flags out-of-range month with a warning but still maps the row", () => {
    const result = mapUsageRow(
      raw({ acc_id: "1", month: "13", usage: "5", year: "2026" }, 7),
      "source-1",
      "Email",
      "API"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.month).toBe(13);
    expect(result.warnings).toEqual([
      "usage month out of range (13) at excel_row 7",
    ]);
  });

  test("defaults missing usage to zero string", () => {
    const result = mapUsageRow(raw({ acc_id: "1" }), "source-1", "SMS", "OTP");
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.usage).toBe("0");
  });
});
