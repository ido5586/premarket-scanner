import { describe, it, expect } from "vitest";
import { parseFloatValue, parseFloatFromHtml } from "./float";

describe("parseFloatValue", () => {
  it("parses magnitude suffixes into millions", () => {
    expect(parseFloatValue("1.23M")).toBeCloseTo(1.23);
    expect(parseFloatValue("456K")).toBeCloseTo(0.456);
    expect(parseFloatValue("2.1B")).toBeCloseTo(2100);
  });

  it("handles commas and bare share counts", () => {
    expect(parseFloatValue("12,500,000")).toBeCloseTo(12.5);
    expect(parseFloatValue("3.4 M")).toBeCloseTo(3.4);
  });

  it("returns null for unparseable values", () => {
    expect(parseFloatValue("-")).toBeNull();
    expect(parseFloatValue("")).toBeNull();
    expect(parseFloatValue("n/a")).toBeNull();
  });
});

describe("parseFloatFromHtml", () => {
  it("extracts the cell following the Shs Float label", () => {
    const html =
      '<tr><td class="label">Shs Float</td><td class="value"><b>1.23M</b></td></tr>';
    expect(parseFloatFromHtml(html)).toBeCloseTo(1.23);
  });

  it("handles a plain adjacent cell without nested tags", () => {
    const html = "<td>Shs Float</td><td>456K</td>";
    expect(parseFloatFromHtml(html)).toBeCloseTo(0.456);
  });

  it("returns null when the label is absent", () => {
    expect(parseFloatFromHtml("<td>Market Cap</td><td>50M</td>")).toBeNull();
  });

  it("returns null when the value is a dash", () => {
    expect(parseFloatFromHtml("<td>Shs Float</td><td>-</td>")).toBeNull();
  });
});
