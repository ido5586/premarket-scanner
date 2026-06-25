import Link from "next/link";
import { getAllScans, type ScanRecord } from "@/lib/supabase";
import { ScanTable } from "../components/ScanTable";

export const dynamic = "force-dynamic";

// Group rows by scan_date, preserving the newest-first order they arrive in
// (getAllScans returns rows sorted by scanned_at desc).
function groupByDate(rows: ScanRecord[]): { date: string; rows: ScanRecord[] }[] {
  const groups: { date: string; rows: ScanRecord[] }[] = [];
  const index = new Map<string, ScanRecord[]>();
  for (const row of rows) {
    let bucket = index.get(row.scan_date);
    if (!bucket) {
      bucket = [];
      index.set(row.scan_date, bucket);
      groups.push({ date: row.scan_date, rows: bucket });
    }
    bucket.push(row);
  }
  return groups;
}

export default async function History() {
  let rows: ScanRecord[] = [];
  let loadError: string | null = null;
  try {
    rows = await getAllScans(500);
  } catch (err) {
    console.error("[history] getAllScans failed:", err);
    loadError = "Could not load scan history.";
  }

  const groups = groupByDate(rows);

  return (
    <main>
      <h1>היסטוריית סריקות</h1>
      <p>
        <Link href="/">חזרה לסריקה אחרונה</Link>
      </p>

      {loadError ? (
        <p style={{ color: "crimson" }}>{loadError}</p>
      ) : groups.length === 0 ? (
        <p>No scans recorded yet.</p>
      ) : (
        groups.map((group) => (
          <section key={group.date}>
            <h2>{group.date}</h2>
            <ScanTable rows={group.rows} />
          </section>
        ))
      )}
    </main>
  );
}
