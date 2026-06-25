import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ScanRecord = {
  scan_run_id: string;
  scan_date: string;
  ticker: string;
  company_name: string | null;
  premarket_pct: number | null;
  price: number | null;
  premarket_volume: number | null;
  market_cap: number | null;
  market_cap_bucket: string;
  volume_thin: boolean;
  price_bucket: string;
  sector: string | null;
  catalyst_type: string;
  scanned_at: string;
  catalyst_label_he: string;
  catalyst_reason_he: string;
};

let cached: SupabaseClient | null = null;

export function getServerClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export async function insertScanRecords(records: ScanRecord[]): Promise<void> {
  if (records.length === 0) return;
  const { error } = await getServerClient()
    .from("premarket_scans")
    .upsert(records, { onConflict: "scan_run_id,ticker" });
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  console.log(`[supabase] inserted ${records.length} rows`);
}

export async function hasScanForDate(date: string): Promise<boolean> {
  const { count, error } = await getServerClient()
    .from("premarket_scans")
    .select("id", { count: "exact", head: true })
    .eq("scan_date", date);
  if (error) throw new Error(`Supabase dedup check failed: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function getLatestRun(): Promise<ScanRecord[]> {
  const client = getServerClient();
  const { data: latest, error: e1 } = await client
    .from("premarket_scans")
    .select("scan_run_id")
    .order("scanned_at", { ascending: false })
    .limit(1);
  if (e1) throw new Error(`Supabase latest-run lookup failed: ${e1.message}`);
  if (!latest || latest.length === 0) return [];
  const runId = (latest[0] as { scan_run_id: string }).scan_run_id;

  const { data, error: e2 } = await client
    .from("premarket_scans")
    .select("*")
    .eq("scan_run_id", runId)
    .order("premarket_pct", { ascending: false });
  if (e2) throw new Error(`Supabase latest-run rows failed: ${e2.message}`);
  return (data ?? []) as ScanRecord[];
}
