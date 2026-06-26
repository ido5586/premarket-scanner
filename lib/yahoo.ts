// Yahoo Finance v8 chart endpoint gives free daily OHLCV with no API key. We
// only need closing price + volume per day. Everything here is defensive: any
// failure (network, missing field) yields null/[] so the detail page degrades
// gracefully instead of throwing.

const YAHOO_CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type DailyBar = {
  timestamp: number; // epoch seconds for the trading day
  close: number;
  changePct: number | null; // percent change vs the previous kept close
};

// Parse a v8 chart response into trading-day bars. Days with a null close or
// null/zero volume are dropped (holidays, halts, missing data), and percent
// change is measured against the previous *kept* day's close.
export function parseYahooChart(json: unknown): DailyBar[] {
  const result = (json as { chart?: { result?: unknown[] } })?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = (result as { timestamp?: unknown }).timestamp;
  const quote = (result as { indicators?: { quote?: unknown[] } }).indicators?.quote?.[0];
  if (!Array.isArray(timestamps) || !quote) return [];
  const closes = (quote as { close?: unknown }).close;
  const volumes = (quote as { volume?: unknown }).volume;
  if (!Array.isArray(closes) || !Array.isArray(volumes)) return [];

  const kept: { timestamp: number; close: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const close = closes[i];
    const volume = volumes[i];
    if (typeof ts !== "number") continue;
    if (typeof close !== "number" || !Number.isFinite(close)) continue;
    if (typeof volume !== "number" || volume === 0) continue;
    kept.push({ timestamp: ts, close });
  }

  return kept.map((bar, i) => {
    const prev = i > 0 ? kept[i - 1].close : null;
    const changePct =
      prev != null && prev !== 0 ? ((bar.close - prev) / prev) * 100 : null;
    return { timestamp: bar.timestamp, close: bar.close, changePct };
  });
}

// Fetch the last ~10 days of daily bars for a ticker. Returns null on any
// failure so callers can show a graceful fallback.
export async function fetchDailyHistory(ticker: string): Promise<DailyBar[] | null> {
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(ticker)}?interval=1d&range=10d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[yahoo] ${ticker} chart request failed: ${res.status}`);
      return null;
    }
    const json = await res.json();
    return parseYahooChart(json);
  } catch (err) {
    console.warn(`[yahoo] ${ticker} chart request error:`, err);
    return null;
  }
}
