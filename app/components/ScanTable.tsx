import type { ScanRecord } from "@/lib/supabase";
import {
  formatMarketCap,
  formatVolume,
  formatPct,
  formatPrice,
  formatFloat,
} from "@/lib/format";

// Compact "24/06/2026 22:53" timestamp in Israel time for the scan-time column.
export function formatScanColumn(scannedAt: string): string {
  const date = new Date(scannedAt);
  const opts = { timeZone: "Asia/Jerusalem" } as const;
  const day = new Intl.DateTimeFormat("he-IL", { ...opts, day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("he-IL", { ...opts, month: "2-digit" }).format(date);
  const year = new Intl.DateTimeFormat("he-IL", { ...opts, year: "numeric" }).format(date);
  const hour = new Intl.DateTimeFormat("he-IL", { ...opts, hour: "2-digit", hour12: false }).format(date);
  const minute = new Intl.DateTimeFormat("he-IL", { ...opts, minute: "2-digit" }).format(date);
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function flag(rec: ScanRecord): string {
  const f: string[] = [];
  if (rec.catalyst_type === "dilution") f.push("🚩");
  if (rec.volume_thin) f.push("⚠️");
  return f.join("");
}

function scoreColor(score: number | null): string {
  if (score == null) return "inherit";
  if (score >= 70) return "green";
  if (score >= 40) return "goldenrod";
  return "crimson";
}

const linkStyle = { color: "blue", textDecoration: "underline" } as const;

export function ScanTable({ rows }: { rows: ScanRecord[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>זמן סריקה</th>
          <th>Ticker</th>
          <th>גרף</th>
          <th>Float</th>
          <th>Score</th>
          <th>Pre %</th>
          <th>Price</th>
          <th>Market cap</th>
          <th>Pre-market vol</th>
          <th>Catalyst</th>
          <th>Flags</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.scan_run_id}-${r.ticker}`}>
            <td>{formatScanColumn(r.scanned_at)}</td>
            <td>
              <a
                href={`https://finance.yahoo.com/quote/${r.ticker}`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {r.ticker}
              </a>
            </td>
            <td>
              <a
                href={`https://www.tradingview.com/chart/?symbol=${r.ticker}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`TradingView chart for ${r.ticker}`}
              >
                📈
              </a>
            </td>
            <td>{formatFloat(r.float_shares)}</td>
            <td style={{ color: scoreColor(r.momentum_score), fontWeight: 600 }}>
              {r.momentum_score ?? "?"}
            </td>
            <td>{formatPct(r.premarket_pct)}</td>
            <td>{formatPrice(r.price)}</td>
            <td>{formatMarketCap(r.market_cap)}</td>
            <td>{formatVolume(r.premarket_volume)}</td>
            <td>{r.catalyst_label_he}</td>
            <td>{flag(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
