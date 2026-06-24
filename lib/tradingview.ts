import { TV_COLUMNS, TV_FILTERS, TV_SCAN_URL } from "./config";

export type ScanRow = {
  ticker: string;
  exchange: string;
  name: string | null;
  companyName: string | null;
  price: number | null;
  premarketPct: number | null;
  premarketVolume: number | null;
  volume: number | null;
  marketCap: number | null;
  sector: string | null;
};

type BuildOpts = {
  includePremarketFilter?: boolean;
  range?: [number, number];
};

export function buildScanRequest(opts: BuildOpts = {}): object {
  const includePremarketFilter = opts.includePremarketFilter ?? true;
  const range = opts.range ?? [0, 100];
  const filter = includePremarketFilter
    ? [...TV_FILTERS]
    : TV_FILTERS.filter((f) => f.left !== "premarket_change");
  return {
    filter,
    options: { lang: "en" },
    markets: ["america"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: [...TV_COLUMNS],
    sort: { sortBy: "premarket_change", sortOrder: "desc" },
    range,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function parseScanResponse(json: unknown): ScanRow[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const idx = (col: string) => TV_COLUMNS.indexOf(col as (typeof TV_COLUMNS)[number]);
  const rows: ScanRow[] = [];
  for (const entry of data) {
    const s = (entry as { s?: unknown })?.s;
    const d = (entry as { d?: unknown })?.d;
    if (typeof s !== "string" || !Array.isArray(d)) continue;
    const [exchange, ticker] = s.includes(":") ? s.split(":") : ["", s];
    if (!ticker) continue;
    rows.push({
      ticker,
      exchange,
      name: str(d[idx("name")]),
      companyName: str(d[idx("description")]),
      price: num(d[idx("close")]),
      premarketPct: num(d[idx("premarket_change")]),
      premarketVolume: num(d[idx("premarket_volume")]),
      volume: num(d[idx("volume")]),
      marketCap: num(d[idx("market_cap_basic")]),
      sector: str(d[idx("sector")]),
    });
  }
  return rows;
}

export async function fetchScan(opts: BuildOpts = {}): Promise<ScanRow[]> {
  const TV_SESSION_ID = process.env.TV_SESSION_ID;
  const TV_SESSION_SIGN = process.env.TV_SESSION_SIGN;
  if (!TV_SESSION_ID || !TV_SESSION_SIGN) {
    throw new Error(
      "Missing TV_SESSION_ID or TV_SESSION_SIGN env vars. Set both to TradingView session cookies before calling fetchScan.",
    );
  }

  const res = await fetch(TV_SCAN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `sessionid=${TV_SESSION_ID}; sessionid_sign=${TV_SESSION_SIGN}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Origin: "https://www.tradingview.com",
      Referer: "https://www.tradingview.com/",
    },
    body: JSON.stringify(buildScanRequest(opts)),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`TradingView scan failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const rows = parseScanResponse(json);
  console.log(`[tradingview] fetched ${rows.length} rows (status ${res.status})`);
  return rows;
}
