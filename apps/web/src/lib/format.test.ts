import { describe, expect, test } from "bun:test";
import {
  formatBaht, formatBahtCompact, formatCount, formatCountCompact, formatCredits, formatDate, formatDateTime, formatDaysAgo,
  formatDaysAhead, formatMonth, formatPercent, formatSignedPercent,
} from "./format";

describe("format", () => {
  test("baht", () => {
    expect(formatBaht(2_223_000)).toBe("฿2,223,000");
    expect(formatBaht(0)).toBe("฿0");
    expect(formatBaht(-0.4)).toBe("฿0");
    expect(formatBaht(-18_400)).toBe("−฿18,400");
  });

  test("compact baht at the 1,000 and 1,000,000 edges", () => {
    expect(formatBahtCompact(999)).toBe("฿999");
    expect(formatBahtCompact(1_000)).toBe("฿1K");
    expect(formatBahtCompact(850_000)).toBe("฿850K");
    expect(formatBahtCompact(999_999)).toBe("฿1.0M");
    expect(formatBahtCompact(1_000_000)).toBe("฿1.0M");
    expect(formatBahtCompact(26_400_000)).toBe("฿26.4M");
    expect(formatBahtCompact(-18_400_000)).toBe("−฿18.4M");
    expect(formatBahtCompact(0)).toBe("฿0");
    expect(formatCountCompact(999_999)).toBe("1.0M");
    expect(formatCountCompact(12_400)).toBe("12K");
    expect(formatCountCompact(-5)).toBe("−5");
  });

  test("counts, credits, percents", () => {
    expect(formatCount(2572)).toBe("2,572");
    expect(formatCredits(12_400)).toBe("12,400 เครดิต");
    expect(formatPercent(0.78)).toBe("78%");
    expect(formatPercent(0.014, 1)).toBe("1.4%");
    expect(formatSignedPercent(0.042)).toBe("+4.2%");
    expect(formatSignedPercent(-0.042)).toBe("−4.2%");
    expect(formatSignedPercent(0)).toBe("0.0%");
    expect(formatSignedPercent(0.00001)).toBe("0.0%");
  });

  test("days", () => {
    expect(formatDaysAhead(null)).toBe("—");
    expect(formatDaysAhead(41)).toBe("ใน 41 วัน");
    expect(formatDaysAhead(90)).toBe("ใน 90 วัน");
    expect(formatDaysAhead(91)).toBe("เกิน 90 วัน");
    expect(formatDaysAhead(0)).toBe("วันนี้");
    expect(formatDaysAgo(null)).toBe("—");
    expect(formatDaysAgo(0)).toBe("วันนี้");
    expect(formatDaysAgo(1)).toBe("เมื่อวาน");
    expect(formatDaysAgo(12)).toBe("12 วันก่อน");
  });

  test("dates use the Buddhist year in Bangkok time", () => {
    expect(formatDate("2026-01-01")).toBe("1 ม.ค. 2569");
    expect(formatDate("2025-12-31T18:00:00Z")).toBe("1 ม.ค. 2569");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
    expect(formatDateTime("2026-01-01T07:05:00Z")).toBe("1 ม.ค. 2569 14:05");
    expect(formatMonth("2025-01")).toBe("ม.ค.");
    expect(formatMonth("2025-01", true)).toBe("ม.ค. 68");
  });
});
