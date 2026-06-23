import { describe, it, expect } from "vitest";
import { parseCatalystJson } from "./classify";

describe("parseCatalystJson", () => {
  it("parses clean JSON", () => {
    const out = parseCatalystJson(
      '{"catalyst_type":"real","label_he":"אישור FDA","reason_he":"קיבלה אישור FDA לתרופה"}',
    );
    expect(out.catalystType).toBe("real");
    expect(out.labelHe).toBe("אישור FDA");
    expect(out.reasonHe).toBe("קיבלה אישור FDA לתרופה");
  });

  it("strips markdown fences", () => {
    const raw = '```json\n{"catalyst_type":"dilution","label_he":"דילול","reason_he":"הנפקה"}\n```';
    expect(parseCatalystJson(raw).catalystType).toBe("dilution");
  });

  it("falls back to a neutral label on invalid JSON", () => {
    const out = parseCatalystJson("not json at all");
    expect(out.catalystType).toBe("pump");
    expect(out.labelHe.length).toBeGreaterThan(0);
    expect(out.reasonHe.length).toBeGreaterThan(0);
  });

  it("falls back when catalyst_type is not one of the allowed values", () => {
    const out = parseCatalystJson('{"catalyst_type":"banana","label_he":"x","reason_he":"y"}');
    expect(out.catalystType).toBe("pump");
  });
});
