import { describe, expect, test } from "bun:test";
import { toRangeValue } from "./customers-filters";

describe("toRangeValue", () => {
  test("joins both bounds", () => {
    expect(toRangeValue("50000", "100000")).toBe("50000-100000");
  });

  test("keeps an open side open", () => {
    expect(toRangeValue("50000", "")).toBe("50000-");
    expect(toRangeValue("", "100000")).toBe("-100000");
  });

  test("swaps bounds typed the wrong way round", () => {
    expect(toRangeValue("100000", "50000")).toBe("50000-100000");
  });

  test("empty, negative or non-numeric input is no filter", () => {
    expect(toRangeValue("", "")).toBe("");
    expect(toRangeValue(" ", "-5")).toBe("");
    expect(toRangeValue("abc", "")).toBe("");
  });
});
