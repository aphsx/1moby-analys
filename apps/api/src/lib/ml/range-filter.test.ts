import { describe, expect, test } from "bun:test";
import { parseRange } from "./range-filter";

describe("parseRange", () => {
  test("reads both bounds", () => {
    expect(parseRange("50000-100000")).toEqual({ min: 50000, max: 100000 });
  });

  test("either side may be open", () => {
    expect(parseRange("50000-")).toEqual({ min: 50000 });
    expect(parseRange("-100000")).toEqual({ max: 100000 });
  });

  test("keeps decimals", () => {
    expect(parseRange("0.5-12.25")).toEqual({ min: 0.5, max: 12.25 });
  });

  test("no bound, no value or a malformed value is no filter", () => {
    expect(parseRange("-")).toBeNull();
    expect(parseRange("")).toBeNull();
    expect(parseRange(undefined)).toBeNull();
    expect(parseRange("abc")).toBeNull();
    expect(parseRange("50000")).toBeNull();
    expect(parseRange("-5-10")).toBeNull();
    expect(parseRange("1e5-2e5")).toBeNull();
  });
});
