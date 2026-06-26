import Link from "next/link";
import { runManualScan } from "./actions";
import { getLatestRun, type ScanRecord } from "@/lib/supabase";
import { ScanTable } from "./components/ScanTable";

export const dynamic = "force-dynamic";

function formatScanTimestamp(scannedAt: string): string {
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
  return `${day}/${month}/${year} בשעה ${hour}:${minute}`;
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
      <p>
        <Link href="/history">היסטוריה</Link>
      </p>
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
          <ScanTable rows={rows} />
        </>
      )}
    </main>
  );
}
