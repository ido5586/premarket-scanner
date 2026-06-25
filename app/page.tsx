import { runManualScan } from "./actions";
import { getLatestRun, type ScanRecord } from "@/lib/supabase";
import { formatMarketCap, formatVolume, formatPct, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

function formatScanTimestamp(scannedAt: string): string {
  const date = new Date(scannedAt);
  const opts = { timeZone: "Asia/Jerusalem" } as const;
  const day = new Intl.DateTimeFormat("he-IL", { ...opts, day: "2-digit" }).format(date);
  const month = new Intl.DateTimeFormat("he-IL", { ...opts, month: "2-digit" }).format(date);
  const year = new Intl.DateTimeFormat("he-IL", { ...opts, year: "numeric" }).format(date);
  const hour = new Intl.DateTimeFormat("he-IL", { ...opts, hour: "2-digit", hour12: false }).format(date);
  const minute = new Intl.DateTimeFormat("he-IL", { ...opts, minute: "2-digit" }).format(date);
  return `${day}/${month}/${year} בשעה ${hour}:${minute}`;
}

function formatScanColumn(scannedAt: string): string {
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

export default async function Home() {
  let rows: ScanRecord[] = [];
  let loadError: string | null = null;
  try {
    rows = await getLatestRun();
  } catch (err) {
    console.error("[page] getLatestRun failed:", err);
    loadError = "Could not load the latest scan.";
  }

  return (
    <main>
      <h1>Pre-Market Momentum Scanner</h1>
      <p>Manual scan is the primary trigger. Press to run now and refresh the table.</p>
      <form action={runManualScan}>
        <button type="submit">Run scan now</button>
      </form>

      {loadError ? (
        <p style={{ color: "crimson" }}>{loadError}</p>
      ) : rows.length === 0 ? (
        <p>No results yet. Run a scan during US pre-market.</p>
      ) : (
        <>
          <p>סריקה אחרונה: {formatScanTimestamp(rows[0].scanned_at)}</p>
          <table>
            <thead>
              <tr>
                <th>זמן סריקה</th>
                <th>Ticker</th>
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
                <tr key={r.ticker}>
                  <td>{formatScanColumn(r.scanned_at)}</td>
                  <td>
                    <a
                      href={`https://finance.yahoo.com/quote/${r.ticker}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "blue", textDecoration: "underline" }}
                    >
                      {r.ticker}
                    </a>
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
        </>
      )}
    </main>
  );
}
