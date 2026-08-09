import { describe, expect, test } from "bun:test";
import {
  parseCellDate,
  parseCellDateOnly,
  parseCellInt,
  parseCellNumeric,
  parseCellString,
} from "../src/lib/train-clean-cell";

describe("parseCellString", () => {
  test("null/undefined -> null", () => {
    expect(parseCellString(null)).toBeNull();
    expect(parseCellString(undefined)).toBeNull();
  });

  test("blank string -> null", () => {
    expect(parseCellString("   ")).toBeNull();
    expect(parseCellString("")).toBeNull();
  });

  test("trims and returns non-empty string", () => {
    expect(parseCellString("  active  ")).toBe("active");
  });

  test("_excel iso wrapper -> iso string", () => {
    expect(
      parseCellString({
        _excel: "datetime",
        iso: "2026-01-01T00:00:00.000Z",
        serial: 46_023,
      })
    ).toBe("2026-01-01T00:00:00.000Z");
  });

  test("_excel serial-only wrapper -> stringified serial", () => {
    expect(parseCellString({ _excel: "datetime", serial: 46_023 })).toBe(
      "46023"
    );
  });

  test("numbers/booleans stringify", () => {
    expect(parseCellString(42)).toBe("42");
    expect(parseCellString(true)).toBe("true");
  });
});

describe("parseCellInt", () => {
  test("null/blank -> null", () => {
    expect(parseCellInt(null)).toBeNull();
    expect(parseCellInt("")).toBeNull();
  });

  test("non-numeric -> null", () => {
    expect(parseCellInt("abc")).toBeNull();
  });

  test("truncates decimals", () => {
    expect(parseCellInt("42.9")).toBe(42);
    expect(parseCellInt(42.9)).toBe(42);
  });

  test("parses negative and zero", () => {
    expect(parseCellInt("-3")).toBe(-3);
    expect(parseCellInt(0)).toBe(0);
  });
});

describe("parseCellNumeric", () => {
  test("null/blank -> null", () => {
    expect(parseCellNumeric(null)).toBeNull();
    expect(parseCellNumeric("  ")).toBeNull();
  });

  test("non-numeric -> null", () => {
    expect(parseCellNumeric("n/a")).toBeNull();
  });

  test("preserves decimal precision as string", () => {
    expect(parseCellNumeric("12.50")).toBe("12.5");
    expect(parseCellNumeric(3.14)).toBe("3.14");
  });
});

describe("parseCellDate", () => {
  test("null -> null", () => {
    expect(parseCellDate(null)).toBeNull();
  });

  test("undefined -> null (missing Excel cell)", () => {
    expect(parseCellDate(undefined)).toBeNull();
  });

  test("Date instance passes through", () => {
    const d = new Date("2026-03-01T00:00:00.000Z");
    expect(parseCellDate(d)).toEqual(d);
  });

  test("invalid Date instance -> null", () => {
    expect(parseCellDate(new Date("not-a-date"))).toBeNull();
  });

  test("_excel iso wrapper parses to Date", () => {
    const result = parseCellDate({
      _excel: "datetime",
      iso: "2026-03-01T00:00:00.000Z",
    });
    expect(result?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  test("_excel serial wrapper converts from Excel epoch", () => {
    // serial 1 = 1899-12-31 (day after the 1899-12-30 epoch)
    const result = parseCellDate({ _excel: "datetime", serial: 1 });
    expect(result?.toISOString().slice(0, 10)).toBe("1899-12-31");
  });

  test("raw numeric serial converts from Excel epoch", () => {
    const result = parseCellDate(46_023); // 2026-01-01
    expect(result?.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  test("date string parses via Date constructor", () => {
    const result = parseCellDate("2026-05-15");
    expect(result?.toISOString().slice(0, 10)).toBe("2026-05-15");
  });

  test("garbage string -> null", () => {
    expect(parseCellDate("not-a-date")).toBeNull();
  });
});

describe("parseCellDateOnly", () => {
  test("null -> null", () => {
    expect(parseCellDateOnly(null)).toBeNull();
  });

  test("returns YYYY-MM-DD", () => {
    expect(parseCellDateOnly("2026-07-12T10:30:00.000Z")).toBe("2026-07-12");
  });
});
