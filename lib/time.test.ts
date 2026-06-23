import { describe, it, expect } from "vitest";
import { getEtParts, isNineEtHour, finnhubDateRange } from "./time";

describe("getEtParts", () => {
  it("converts a known UTC instant to ET (summer, EDT = UTC-4)", () => {
    // 2026-06-23 13:30 UTC == 09:30 EDT
    const d = new Date("2026-06-23T13:30:00Z");
    expect(getEtParts(d)).toEqual({ hour: 9, date: "2026-06-23" });
  });

  it("converts a known UTC instant to ET (winter, EST = UTC-5)", () => {
    // 2026-01-15 14:30 UTC == 09:30 EST
    const d = new Date("2026-01-15T14:30:00Z");
    expect(getEtParts(d)).toEqual({ hour: 9, date: "2026-01-15" });
  });
});

describe("isNineEtHour", () => {
  it("is true at 09:05 ET and false at 10:00 ET", () => {
    expect(isNineEtHour(new Date("2026-06-23T13:05:00Z"))).toBe(true); // 09:05 EDT
    expect(isNineEtHour(new Date("2026-06-23T14:00:00Z"))).toBe(false); // 10:00 EDT
  });
});

describe("finnhubDateRange", () => {
  it("spans the last 48h ending on the ET date", () => {
    const d = new Date("2026-06-23T13:30:00Z"); // 2026-06-23 ET
    expect(finnhubDateRange(d)).toEqual({ from: "2026-06-21", to: "2026-06-23" });
  });
});
