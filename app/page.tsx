import { runManualScan } from "./actions";
import { getLatestRun, type ScanRecord } from "@/lib/supabase";
import { formatMarketCap, formatVolume, formatPct, formatPrice } from "@/lib/format";

export const dynamic = "force-dynamic";

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
        <table>
          <thead>
            <tr>
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
                <td>{r.ticker}</td>
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
      )}
    </main>
  );
}
