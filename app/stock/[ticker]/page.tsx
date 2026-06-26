import Link from "next/link";
import { getLatestScanForTicker, type ScanRecord } from "@/lib/supabase";
import { fetchDailyHistory, type DailyBar } from "@/lib/yahoo";
import {
  formatMarketCap,
  formatVolume,
  formatPct,
  formatPrice,
  formatFloat,
} from "@/lib/format";

export const dynamic = "force-dynamic";

// DD/MM/YY for a trading day, in Israel time.
function formatDay(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  const opts = { timeZone: "Asia/Jerusalem" } as const;
  const day = new Intl.DateTimeFormat("he-IL", { ...opts, day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("he-IL", { ...opts, month: "2-digit" }).format(date);
  const year = new Intl.DateTimeFormat("he-IL", { ...opts, year: "2-digit" }).format(date);
  return `${day}/${month}/${year}`;
}

// "24/06/26 בשעה 22:53" — same Israel-time style as the main page.
function formatScanTime(scannedAt: string): string {
  const date = new Date(scannedAt);
  const opts = { timeZone: "Asia/Jerusalem" } as const;
  const day = new Intl.DateTimeFormat("he-IL", { ...opts, day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("he-IL", { ...opts, month: "2-digit" }).format(date);
  const year = new Intl.DateTimeFormat("he-IL", { ...opts, year: "numeric" }).format(date);
  const parts = new Intl.DateTimeFormat("he-IL", {
    ...opts,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = parseInt(get("hour"), 10).toString().padStart(2, "0");
  const minute = parseInt(get("minute"), 10).toString().padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

// Signed percent with two decimals, e.g. "+3.45%" / "-2.10%".
function formatChangePct(n: number | null): string {
  if (n == null) return "?";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

const iconLinkStyle = {
  color: "blue",
  textDecoration: "underline",
  marginInlineEnd: 16,
} as const;

export default async function StockDetail({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();

  let scan: ScanRecord | null = null;
  try {
    scan = await getLatestScanForTicker(ticker);
  } catch (err) {
    console.error(`[stock] scan lookup failed for ${ticker}:`, err);
  }

  // Take the 5 most recent trading days, newest first.
  const history = await fetchDailyHistory(ticker);
  const recent: DailyBar[] | null = history
    ? history.slice(-5).reverse()
    : null;

  return (
    <main>
      <p>
        <Link href="/">← חזרה</Link>
      </p>

      <header>
        <h1 style={{ marginBottom: 4 }}>{ticker}</h1>
        <p style={{ margin: "0 0 12px" }}>
          Market cap: {formatMarketCap(scan?.market_cap ?? null)}
        </p>
        <p>
          <a
            href={`https://www.tradingview.com/chart/?symbol=${ticker}`}
            target="_blank"
            rel="noopener noreferrer"
            style={iconLinkStyle}
          >
            📈 גרף
          </a>
          <a
            href={`https://finance.yahoo.com/quote/${ticker}/news/`}
            target="_blank"
            rel="noopener noreferrer"
            style={iconLinkStyle}
          >
            📰 חדשות
          </a>
        </p>
      </header>

      <section>
        <h2>5 ימי מסחר אחרונים</h2>
        {recent == null ? (
          <p>נתונים היסטוריים לא זמינים</p>
        ) : recent.length === 0 ? (
          <p>נתונים היסטוריים לא זמינים</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>תאריך</th>
                <th>סגירה</th>
                <th>שינוי%</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((bar) => (
                <tr key={bar.timestamp}>
                  <td>{formatDay(bar.timestamp)}</td>
                  <td>{formatPrice(bar.close)}</td>
                  <td
                    style={{
                      color:
                        bar.changePct == null
                          ? "inherit"
                          : bar.changePct >= 0
                            ? "green"
                            : "red",
                    }}
                  >
                    {formatChangePct(bar.changePct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>נתוני סריקה</h2>
        {scan == null ? (
          <p>לא נמצאו נתוני סריקה</p>
        ) : (
          <table>
            <tbody>
              <tr>
                <th>אחוז פרה-מרקט</th>
                <td>{formatPct(scan.premarket_pct)}</td>
              </tr>
              <tr>
                <th>מחיר פרה-מרקט</th>
                <td>{formatPrice(scan.price)}</td>
              </tr>
              <tr>
                <th>נפח פרה-מרקט</th>
                <td>{formatVolume(scan.premarket_volume)}</td>
              </tr>
              <tr>
                <th>פלוט</th>
                <td>{formatFloat(scan.float_shares)}</td>
              </tr>
              <tr>
                <th>ציון מומנטום</th>
                <td>{scan.momentum_score ?? "?"}</td>
              </tr>
              <tr>
                <th>קטליסט</th>
                <td>{scan.catalyst_label_he}</td>
              </tr>
              <tr>
                <th>זמן סריקה</th>
                <td>{formatScanTime(scan.scanned_at)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
