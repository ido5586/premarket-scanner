import { describe, it, expect } from "vitest";
import { buildScanRequest, parseScanResponse } from "./tradingview";

describe("buildScanRequest", () => {
  it("includes the premarket filter by default", () => {
    const body = buildScanRequest() as any;
    expect(body.filter).toContainEqual({
      left: "premarket_change",
      operation: "greater",
      right: 90,
    });
    expect(body.columns).toContain("premarket_change");
    expect(body.range).toEqual([0, 100]);
  });

  it("drops the premarket filter in mechanical mode but keeps the stock type filter", () => {
    const body = buildScanRequest({ includePremarketFilter: false, range: [0, 5] }) as any;
    expect(body.filter).not.toContainEqual(
      expect.objectContaining({ left: "premarket_change" }),
    );
    expect(body.filter).toContainEqual({ left: "type", operation: "equal", right: "stock" });
    expect(body.range).toEqual([0, 5]);
  });
});

describe("parseScanResponse", () => {
  it("maps the d array by column index and splits EXCHANGE:TICKER", () => {
    const json = {
      totalCount: 1,
      data: [
        {
          s: "NASDAQ:XYZ",
          d: ["XYZ", "Xyz Corp", 3.21, 152.4, 800000, 2500000, 42000000, "Health Technology"],
        },
      ],
    };
    const rows = parseScanResponse(json);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      ticker: "XYZ",
      exchange: "NASDAQ",
      name: "XYZ",
      companyName: "Xyz Corp",
      price: 3.21,
      premarketPct: 152.4,
      premarketVolume: 800000,
      volume: 2500000,
      marketCap: 42000000,
      sector: "Health Technology",
    });
  });

  it("handles null fields and missing data array defensively", () => {
    expect(parseScanResponse({})).toEqual([]);
    expect(parseScanResponse({ data: null })).toEqual([]);
    const rows = parseScanResponse({
      data: [{ s: "NYSE:ABC", d: ["ABC", "Abc Inc", null, 95.0, null, null, null, null] }],
    });
    expect(rows[0].ticker).toBe("ABC");
    expect(rows[0].price).toBeNull();
    expect(rows[0].marketCap).toBeNull();
    expect(rows[0].sector).toBeNull();
  });
});
