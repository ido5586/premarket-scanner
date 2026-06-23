import { describe, it, expect } from "vitest";
import { formatMarketCap, formatVolume, formatPct, formatPrice } from "./format";

describe("formatMarketCap", () => {
  it("formats millions and billions", () => {
    expect(formatMarketCap(12_300_000)).toBe("12.3M");
    expect(formatMarketCap(2_500_000_000)).toBe("2.5B");
    expect(formatMarketCap(950_000)).toBe("0.95M");
    expect(formatMarketCap(null)).toBe("?");
  });
});

describe("formatVolume", () => {
  it("groups thousands and handles null", () => {
    expect(formatVolume(1234567)).toBe("1,234,567");
    expect(formatVolume(null)).toBe("?");
  });
});

describe("formatPct", () => {
  it("rounds and signs", () => {
    expect(formatPct(152.37)).toBe("+152%");
    expect(formatPct(null)).toBe("?");
  });
});

describe("formatPrice", () => {
  it("two decimals with a dollar sign", () => {
    expect(formatPrice(3.2)).toBe("$3.20");
    expect(formatPrice(null)).toBe("?");
  });
});
