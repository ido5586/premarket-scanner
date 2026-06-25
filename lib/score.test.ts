import { describe, it, expect } from "vitest";
import { calculateScore } from "./score";

describe("calculateScore", () => {
  it("awards the full 100 for a max-momentum, micro-cap, low-float mover", () => {
    expect(
      calculateScore({
        premarketPct: 200, // full 40
        premarketVolume: 1_000_000, // full 30
        marketCap: 30_000_000, // micro -> 20
        floatShares: 0.5, // <1M -> 10
      }),
    ).toBe(100);
  });

  it("scales linearly in the middle of each band", () => {
    expect(
      calculateScore({
        premarketPct: 145, // (145-90)/110*40 = 20
        premarketVolume: 500_000, // 15
        marketCap: 100_000_000, // small -> 10
        floatShares: 3, // 1-5M -> 7
      }),
    ).toBe(52);
  });

  it("caps each component and gives zero for large cap and large float", () => {
    expect(
      calculateScore({
        premarketPct: 500, // capped at 40
        premarketVolume: 5_000_000, // capped at 30
        marketCap: 400_000_000, // mid_plus -> 0
        floatShares: 20, // >10M -> 0
      }),
    ).toBe(70);
  });

  it("treats nulls as zero contribution", () => {
    expect(
      calculateScore({
        premarketPct: 90, // baseline -> 0
        premarketVolume: 0,
        marketCap: null,
        floatShares: null,
      }),
    ).toBe(0);
  });

  it("applies inverse float bands at the boundaries", () => {
    const base = {
      premarketPct: 90,
      premarketVolume: 0,
      marketCap: null,
    };
    expect(calculateScore({ ...base, floatShares: 0.9 })).toBe(10);
    expect(calculateScore({ ...base, floatShares: 5 })).toBe(7);
    expect(calculateScore({ ...base, floatShares: 10 })).toBe(4);
    expect(calculateScore({ ...base, floatShares: 10.5 })).toBe(0);
  });
});
