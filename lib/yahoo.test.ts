import { describe, it, expect } from "vitest";
import { parseYahooChart } from "./yahoo";

function chart(opts: {
  timestamp: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
}): unknown {
  return {
    chart: {
      result: [
        {
          timestamp: opts.timestamp,
          indicators: { quote: [{ close: opts.close, volume: opts.volume }] },
        },
      ],
      error: null,
    },
  };
}

describe("parseYahooChart", () => {
  it("returns bars with percent change versus the previous close", () => {
    const bars = parseYahooChart(
      chart({
        timestamp: [1000, 2000, 3000],
        close: [10, 11, 10.45],
        volume: [5_000_000, 6_000_000, 7_000_000],
      }),
    );
    expect(bars).toHaveLength(3);
    expect(bars[0].changePct).toBeNull();
    expect(bars[1].changePct).toBeCloseTo(10, 5);
    expect(bars[2].changePct).toBeCloseTo(-5, 5);
    expect(bars[2].close).toBe(10.45);
    expect(bars[2].timestamp).toBe(3000);
  });

  it("skips days with null or zero volume before computing change", () => {
    const bars = parseYahooChart(
      chart({
        timestamp: [1000, 2000, 3000, 4000],
        close: [10, 99, 11, 12],
        volume: [5_000_000, 0, null, 6_000_000],
      }),
    );
    expect(bars.map((b) => b.close)).toEqual([10, 12]);
    // Change is measured against the last *kept* close (10), not the skipped 11.
    expect(bars[1].changePct).toBeCloseTo(20, 5);
  });

  it("skips days with a null close", () => {
    const bars = parseYahooChart(
      chart({
        timestamp: [1000, 2000],
        close: [null, 12],
        volume: [5_000_000, 6_000_000],
      }),
    );
    expect(bars.map((b) => b.close)).toEqual([12]);
  });

  it("returns an empty array for malformed responses", () => {
    expect(parseYahooChart(null)).toEqual([]);
    expect(parseYahooChart({})).toEqual([]);
    expect(parseYahooChart({ chart: { result: [] } })).toEqual([]);
    expect(parseYahooChart({ chart: { result: [{ timestamp: [1] }] } })).toEqual([]);
  });
});
