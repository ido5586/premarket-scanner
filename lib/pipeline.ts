import { randomUUID } from "node:crypto";
import { fetchScan } from "./tradingview";
import { tagRow } from "./tagging";
import { fetchCompanyNews } from "./finnhub";
import { classifyTicker } from "./classify";
import { fetchFloat } from "./float";
import { calculateScore } from "./score";
import { insertScanRecords, type ScanRecord } from "./supabase";
import { sendAlert, type AlertItem } from "./telegram";
import { getEtParts } from "./time";
import { MIN_PREMARKET_PCT } from "./config";

export type RunResult = {
  scanRunId: string;
  fetched: number;
  kept: number;
  items: AlertItem[];
};

export async function runScan(
  opts: { isAutomatic?: boolean; now?: Date } = {},
): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const scanRunId = randomUUID();
  const { date: scanDate } = getEtParts(now);
  console.log(
    `[pipeline] runScan start run=${scanRunId} date=${scanDate} automatic=${!!opts.isAutomatic}`,
  );

  const rows = await fetchScan({ includePremarketFilter: true, range: [0, 100] });
  // Defensive second filter: keep only confirmed >90% movers.
  const kept = rows.filter(
    (r) => r.premarketPct != null && r.premarketPct > MIN_PREMARKET_PCT,
  );
  console.log(`[pipeline] fetched=${rows.length} kept=${kept.length}`);

  const records: ScanRecord[] = [];
  const items: AlertItem[] = [];

  // Classify sequentially to respect Finnhub (~60/min) and Anthropic limits.
  for (const row of kept) {
    const tags = tagRow(row);
    // Float scrape has no rate limit, so kick it off up front and let the
    // rate-limited news + classify chain run while it resolves.
    const floatPromise = fetchFloat(row.ticker);
    const headlines = await fetchCompanyNews(row.ticker, now);
    const catalyst = await classifyTicker(row.ticker, headlines);
    const floatShares = await floatPromise;

    const momentumScore = calculateScore({
      premarketPct: row.premarketPct,
      premarketVolume: row.premarketVolume,
      marketCap: row.marketCap,
      floatShares,
    });

    records.push({
      scan_run_id: scanRunId,
      scan_date: scanDate,
      scanned_at: new Date().toISOString(),
      ticker: row.ticker,
      company_name: row.companyName,
      premarket_pct: row.premarketPct,
      price: row.price,
      premarket_volume: row.premarketVolume,
      market_cap: row.marketCap,
      market_cap_bucket: tags.marketCapBucket,
      volume_thin: tags.volumeThin,
      price_bucket: tags.priceBucket,
      sector: row.sector,
      catalyst_type: catalyst.catalystType,
      catalyst_label_he: catalyst.labelHe,
      catalyst_reason_he: catalyst.reasonHe,
      float_shares: floatShares,
      momentum_score: momentumScore,
    });

    items.push({
      ticker: row.ticker,
      premarketPct: row.premarketPct,
      price: row.price,
      marketCap: row.marketCap,
      premarketVolume: row.premarketVolume,
      volumeThin: tags.volumeThin,
      catalystType: catalyst.catalystType,
      catalystLabelHe: catalyst.labelHe,
      floatShares,
      momentumScore,
    });
  }

  await insertScanRecords(records);
  await sendAlert(items);

  console.log(`[pipeline] runScan done run=${scanRunId} kept=${kept.length}`);
  return { scanRunId, fetched: rows.length, kept: kept.length, items };
}
