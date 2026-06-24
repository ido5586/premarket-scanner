import { NextResponse } from "next/server";
import { runScan } from "@/lib/pipeline";
import { isNineEtHour, getEtParts } from "@/lib/time";
import { hasScanForDate } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Hobby cron fires anywhere within the scheduled hour, so guard on ET hour == 9
  // (not minute). Both UTC crons fire; only the one landing in the 9 ET hour acts.
  if (!isNineEtHour(now)) {
    const { hour } = getEtParts(now);
    console.log(`[api/scan] skipped: ET hour is ${hour}, not 9`);
    return NextResponse.json({ skipped: "not 9 ET hour" });
  }

  const { date } = getEtParts(now);
  // Best-effort dedup only. Both UTC cron schedules can in rare cases both land in
  // the 9 ET hour (clock skew/retry), and since this SELECT-then-INSERT is not
  // transactional, a concurrent double-fire could still produce two runs (two
  // alerts) for the same date. This residual race is accepted: cron is just the
  // best-effort backup trigger (the manual button is primary), the blast radius is
  // one duplicate alert (the unique (scan_run_id, ticker) constraint still prevents
  // row duplication), and a scan_date-level unique constraint is intentionally NOT
  // used because it would break the intraday-history design (repeated manual runs
  // on the same day must each create their own run).
  if (await hasScanForDate(date)) {
    console.log(`[api/scan] skipped: scan already exists for ${date}`);
    return NextResponse.json({ skipped: "already scanned today" });
  }

  try {
    const result = await runScan({ isAutomatic: true, now });
    return NextResponse.json({ ok: true, kept: result.kept, scanRunId: result.scanRunId });
  } catch (err) {
    console.error("[api/scan] runScan failed:", err);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
