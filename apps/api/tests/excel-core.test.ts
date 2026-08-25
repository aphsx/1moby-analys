import { describe, expect, test } from "bun:test";
import {
  buildPayload,
  cellToJson,
  chunk,
  rowIsEmpty,
  trimHeader,
  validateHeaders,
  validateWorkbookSheets,
} from "../src/lib/data-import/excel-core";

describe("chunk", () => {
  test("splits into even groups", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  test("last group holds the remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("empty array -> empty chunks", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("trimHeader", () => {
  test("null -> null", () => {
    expect(trimHeader(null)).toBeNull();
  });

  test("undefined -> null (short/sparse header row)", () => {
    expect(trimHeader(undefined)).toBeNull();
  });

  test("blank -> null", () => {
    expect(trimHeader("   ")).toBeNull();
  });

  test("trims surrounding whitespace", () => {
    expect(trimHeader("  acc_id  ")).toBe("acc_id");
  });
});

describe("cellToJson", () => {
  test("null passes through", () => {
    expect(cellToJson(null)).toBeNull();
  });

  test("undefined (short row) passes through as null", () => {
    expect(cellToJson(undefined)).toBeNull();
  });

  test("Date becomes an _excel wrapper with iso + serial", () => {
    const d = new Date(Date.UTC(2026, 0, 1));
    const result = cellToJson(d) as {
      _excel: string;
      iso: string;
      serial: number;
    };
    expect(result._excel).toBe("datetime");
    expect(result.iso).toBe(d.toISOString());
    expect(result.serial).toBeCloseTo(46_023, 0);
  });

  test("primitives pass through unchanged", () => {
    expect(cellToJson("text")).toBe("text");
    expect(cellToJson(42)).toBe(42);
    expect(cellToJson(true)).toBe(true);
  });

  test("other objects get stringified", () => {
    expect(cellToJson({ foo: "bar" })).toBe("[object Object]");
  });
});

describe("rowIsEmpty", () => {
  test("all-null row is empty", () => {
    expect(rowIsEmpty([null, null])).toBe(true);
  });

  test("trailing undefined cells (short row) count as empty", () => {
    expect(rowIsEmpty([null, undefined])).toBe(true);
  });

  test("all-blank-string row is empty", () => {
    expect(rowIsEmpty(["", "   ", null])).toBe(true);
  });

  test("any non-blank value makes it non-empty", () => {
    expect(rowIsEmpty([null, "x"])).toBe(false);
    expect(rowIsEmpty([0])).toBe(false);
  });
});

describe("buildPayload", () => {
  test("maps headers to values by index, skipping null headers", () => {
    const payload = buildPayload(
      ["acc_id", null, "status"],
      [1, "ignored", "active"]
    );
    expect(payload).toEqual({ acc_id: 1, status: "active" });
  });

  test("missing trailing cells map to null", () => {
    const payload = buildPayload(["acc_id", "status"], [1]);
    expect(payload).toEqual({ acc_id: 1, status: null });
  });
});

describe("validateHeaders", () => {
  test("passes when all required headers are present", () => {
    expect(() =>
      validateHeaders("Sheet1", ["acc_id", "status"], ["acc_id"])
    ).not.toThrow();
  });

  test("throws with sheet name and found headers when a required header is missing", () => {
    expect(() => validateHeaders("Sheet1", ["status"], ["acc_id"])).toThrow(
      /Sheet "Sheet1"/
    );
  });
});

describe("validateWorkbookSheets", () => {
  test("passes when all required sheets are present", () => {
    expect(() =>
      validateWorkbookSheets(
        ["Users+User_profile", "Backend_payment"],
        { "Users+User_profile": {} },
        ["Users+User_profile"]
      )
    ).not.toThrow();
  });

  test("throws naming the missing sheet", () => {
    expect(() =>
      validateWorkbookSheets([], {}, ["Users+User_profile"])
    ).toThrow(/Users\+User_profile/);
  });
});
