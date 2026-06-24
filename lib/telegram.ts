import { TELEGRAM_API_BASE } from "./config";
import { formatMarketCap, formatVolume, formatPct, formatPrice } from "./format";

export type AlertItem = {
  ticker: string;
  premarketPct: number | null;
  price: number | null;
  marketCap: number | null;
  premarketVolume: number | null;
  volumeThin: boolean;
  catalystType: "real" | "pump" | "dilution";
  catalystLabelHe: string;
};

const NO_GAPPERS = "אין מניות פרה-מרקט עם עלייה מעל 90% היום.";

export function buildAlertMessage(items: AlertItem[]): string {
  if (items.length === 0) return NO_GAPPERS;

  const sorted = [...items].sort(
    (a, b) => (b.premarketPct ?? 0) - (a.premarketPct ?? 0),
  );

  const header = `🚀 מניות פרה-מרקט מעל 90% (${sorted.length})`;
  const blocks = sorted.map((it) => {
    const flags: string[] = [];
    if (it.catalystType === "dilution") flags.push("🚩");
    if (it.volumeThin) flags.push("⚠️");
    const flagStr = flags.length ? " " + flags.join("") : "";
    const lines = [
      `${it.ticker} ${formatPct(it.premarketPct)}${flagStr}`,
      `מחיר: ${formatPrice(it.price)} | שווי שוק: ${formatMarketCap(it.marketCap)} | נפח פרה-מרקט: ${formatVolume(it.premarketVolume)}`,
      `קטליסט: ${it.catalystLabelHe}`,
    ];
    return lines.join("\n");
  });

  return [header, ...blocks].join("\n\n");
}

export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] token or chat id missing; skipping send");
    return;
  }
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[telegram] send failed: ${res.status} ${body}`);
    return;
  }
  console.log("[telegram] alert sent");
}

export async function sendAlert(items: AlertItem[]): Promise<void> {
  if (items.length === 0 && process.env.SEND_EMPTY_ALERTS === "false") {
    console.log("[telegram] no gappers and SEND_EMPTY_ALERTS=false; not sending");
    return;
  }
  await sendTelegram(buildAlertMessage(items));
}
