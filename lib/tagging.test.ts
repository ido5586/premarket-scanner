import { describe, it, expect } from "vitest";
import { tagRow } from "./tagging";
import type { ScanRow } from "./tradingview";

function row(partial: Partial<ScanRow>): ScanRow {
  return {
    ticker: "T", exchange: "NASDAQ", name: "T", companyName: "T Inc",
    price: 10, premarketPct: 120, premarketVolume: 5_000_000,
    volume: 10_000_000, marketCap: 100_000_000, sector: "Tech",
    ...partial,
  };
}

describe("tagRow", () => {
  it("buckets market cap", () => {
    expect(tagRow(row({ marketCap: 20_000_000 })).marketCapBucket).toBe("micro");
    expect(tagRow(row({ marketCap: 100_000_000 })).marketCapBucket).toBe("small");
    expect(tagRow(row({ marketCap: 500_000_000 })).marketCapBucket).toBe("mid_plus");
    expect(tagRow(row({ marketCap: null })).marketCapBucket).toBe("unknown");
  });

  it("buckets market cap at the micro/small/mid_plus boundaries", () => {
    expect(tagRow(row({ marketCap: 49_999_999 })).marketCapBucket).toBe("micro");
    expect(tagRow(row({ marketCap: 50_000_000 })).marketCapBucket).toBe("small");
    expect(tagRow(row({ marketCap: 300_000_000 })).marketCapBucket).toBe("small");
    expect(tagRow(row({ marketCap: 300_000_001 })).marketCapBucket).toBe("mid_plus");
  });

  it("buckets price", () => {
    expect(tagRow(row({ price: 1 })).priceBucket).toBe("penny");
    expect(tagRow(row({ price: 50 })).priceBucket).toBe("normal");
    expect(tagRow(row({ price: null })).priceBucket).toBe("unknown");
  });

  it("buckets price at the penny/normal boundary", () => {
    expect(tagRow(row({ price: 1.49 })).priceBucket).toBe("penny");
    expect(tagRow(row({ price: 1.5 })).priceBucket).toBe("normal");
  });

  it("flags thin volume only when volume is at or below the threshold", () => {
    expect(tagRow(row({ premarketVolume: 500_000 })).volumeThin).toBe(true);
    expect(tagRow(row({ premarketVolume: 5_000_000 })).volumeThin).toBe(false);
  });

  it("does not flag thin volume when premarket volume is unknown", () => {
    expect(tagRow(row({ premarketVolume: null })).volumeThin).toBe(false);
  });
});
