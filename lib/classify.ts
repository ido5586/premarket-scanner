import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFIER_MODEL } from "./config";
import type { Headline } from "./news";

export type Catalyst = {
  catalystType: "real" | "pump" | "dilution";
  labelHe: string;
  reasonHe: string;
};

const NEUTRAL_FALLBACK: Catalyst = {
  catalystType: "pump",
  labelHe: "לא ידוע",
  reasonHe: "לא ניתן לסווג את החדשות",
};

const NO_NEWS: Catalyst = {
  catalystType: "pump",
  labelHe: "אין חדשות",
  reasonHe: "לא נמצאו חדשות תומכות בעלייה",
};

export function parseCatalystJson(raw: string): Catalyst {
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const type = obj.catalyst_type;
    if (type !== "real" && type !== "pump" && type !== "dilution") {
      return NEUTRAL_FALLBACK;
    }
    const labelHe = typeof obj.label_he === "string" && obj.label_he.length > 0
      ? obj.label_he
      : NEUTRAL_FALLBACK.labelHe;
    const reasonHe = typeof obj.reason_he === "string" && obj.reason_he.length > 0
      ? obj.reason_he
      : NEUTRAL_FALLBACK.reasonHe;
    return { catalystType: type, labelHe, reasonHe };
  } catch {
    return NEUTRAL_FALLBACK;
  }
}

const SYSTEM_PROMPT = [
  "You classify why a US stock is spiking pre-market, using its recent news headlines.",
  "Return ONLY a JSON object, no preamble and no markdown fences, in exactly this shape:",
  '{ "catalyst_type": "real" | "pump" | "dilution", "label_he": "<short Hebrew label>", "reason_he": "<one short Hebrew sentence>" }',
  "Classification guidance:",
  '- "real": a material catalyst such as an FDA approval or decision, a merger or acquisition, a major contract or partnership, an earnings beat, or clinical trial results.',
  '- "dilution": any sign of a stock offering, ATM program, registered direct, warrant exercise, or reverse split. Treat this as a RED FLAG, not bullish.',
  '- "pump": a large move with no supporting news.',
  "label_he and reason_he must be in Hebrew and short.",
].join("\n");

export async function classifyTicker(
  ticker: string,
  headlines: Headline[],
): Promise<Catalyst> {
  if (headlines.length === 0) {
    console.log(`[classify] ${ticker}: no headlines -> pump`);
    return NO_NEWS;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[classify] ANTHROPIC_API_KEY not set; using neutral fallback");
    return NEUTRAL_FALLBACK;
  }

  const client = new Anthropic({ apiKey });
  const headlineText = headlines
    .slice(0, 15)
    .map((h, i) => {
      const sourceLabel = h.source === "yahoo" ? "Yahoo" : "Finnhub";
      return `${i + 1}. [${sourceLabel}] ${h.headline}${h.summary ? " - " + h.summary : ""}`;
    })
    .join("\n");

  const userContent =
    `Ticker: ${ticker}\nRecent headlines (last 48h):\n${headlineText}\n\n` +
    "Classify and respond with the JSON object only.";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.messages.create({
        model: CLASSIFIER_MODEL,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });
      const block = res.content.find((b) => b.type === "text");
      const text = block && block.type === "text" ? block.text : "";
      const out = parseCatalystJson(text);
      console.log(`[classify] ${ticker}: ${out.catalystType} (${out.labelHe})`);
      return out;
    } catch (err) {
      const wait = 500 * (attempt + 1);
      console.warn(`[classify] ${ticker} attempt ${attempt + 1} failed, retrying in ${wait}ms`, err);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  console.warn(`[classify] ${ticker}: all attempts failed -> neutral fallback`);
  return NEUTRAL_FALLBACK;
}
