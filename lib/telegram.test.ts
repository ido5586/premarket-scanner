import { describe, it, expect } from "vitest";
import { buildAlertMessage, type AlertItem } from "./telegram";

function item(p: Partial<AlertItem>): AlertItem {
  return {
    ticker: "AAA", premarketPct: 120, price: 4, marketCap: 30_000_000,
    premarketVolume: 800_000, volumeThin: false, catalystType: "pump",
    catalystLabelHe: "אין חדשות", floatShares: 3.2, momentumScore: 55, ...p,
  };
}

describe("buildAlertMessage", () => {
  it("sorts by premarket pct descending and includes each ticker", () => {
    const msg = buildAlertMessage([
      item({ ticker: "LOW", premarketPct: 95 }),
      item({ ticker: "HIGH", premarketPct: 300 }),
    ]);
    expect(msg.indexOf("HIGH")).toBeLessThan(msg.indexOf("LOW"));
    expect(msg).toContain("HIGH");
    expect(msg).toContain("LOW");
  });

  it("marks dilution with a red flag and thin volume with a warning", () => {
    const msg = buildAlertMessage([
      item({ ticker: "DIL", catalystType: "dilution" }),
      item({ ticker: "THN", volumeThin: true }),
    ]);
    const dilLine = msg.split("\n").find((l) => l.includes("DIL")) ?? "";
    const thnLine = msg.split("\n").find((l) => l.includes("THN")) ?? "";
    expect(dilLine).toContain("🚩");
    expect(thnLine).toContain("⚠️");
  });

  it("returns the no-gappers Hebrew message for an empty list", () => {
    const msg = buildAlertMessage([]);
    expect(msg).toContain("90%");
    expect(msg.length).toBeGreaterThan(0);
  });
});
