# US Pre-Market Momentum Scanner + Alerts - Design

Date: 2026-06-23
Status: Approved

## Goal

A scan-and-alert tool that, every weekday at 09:00 US Eastern (16:00 Israel) and
on demand, finds US stocks up more than 90% in the pre-market session, classifies
each by whether it has a real news catalyst or looks like a pump, stores the
results in Supabase, and pushes a Telegram alert.

Scope: scan and alert ONLY. No trade execution, no portfolio tracking.

## Decisions (locked)

- Primary trigger: the on-demand manual button. The user is at the desk at 16:00
  Israel anyway. The dual Vercel cron is a best-effort backup only.
- Classifier model: claude-haiku-4-5 (full id claude-haiku-4-5-20251001), kept in
  one swappable config constant.
- Delivery: incremental, with three verification checkpoints.

## Stack and constraints

- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres) for storage
- Vercel for hosting and Cron (backup trigger)
- Telegram Bot for alerts
- Anthropic API for catalyst classification
- Finnhub free tier for company news
- Dev OS is Windows. Run dev with `next dev --no-turbopack` (Turbopack memory
  issue on Windows).
- Regular hyphens only everywhere: code, comments, UI text. No em dashes.

## Architecture

A shared `runScan()` function in `lib/pipeline.ts` owns the linear pipeline. It is
called by BOTH the `/api/scan` route (cron path) and the page's server action
(manual path). Each stage is an isolated module with a typed interface so it can
be tested on its own.

```
fetch TradingView -> filter >90% -> tag -> classify (Anthropic) -> insert (Supabase) -> alert (Telegram)
```

`runScan({ isAutomatic })` generates one `scan_run_id` (UUID) per call, shared by
all tickers in that run, and returns the run's results. The `isAutomatic` flag
controls only the ET-hour check and the dedup (see route guard logic). It never
controls auth.

### Modules

- `lib/config.ts` - central constants: classifier model id, thin-volume
  threshold, market-cap bucket thresholds, price bucket threshold, and the
  TradingView field/column map. Single source of truth for anything likely to
  change.
- `lib/pipeline.ts` - `runScan()`, the shared orchestrator called by both the
  route and the server action.
- `lib/tradingview.ts` - builds the POST to the scanner endpoint, parses the
  `d[]`-by-column-index response, splits `EXCHANGE:TICKER`. All field names and
  column order come from the config constant. Exports a typed `ScanRow[]`.
- `lib/finnhub.ts` - company-news fetch for the last 48h, defensive against empty
  results.
- `lib/classify.ts` - Anthropic call (model from config), strict JSON-only
  prompt, defensive parse (strip stray fences, try/catch, neutral fallback). No
  headlines -> `pump` with a Hebrew "no news found" reason.
- `lib/telegram.ts` - Hebrew message formatting (dilution red-flag emoji,
  thin-volume warning emoji), human number formatting, sorted by premarket_pct
  desc, empty-alert path gated by `SEND_EMPTY_ALERTS`.
- `lib/supabase.ts` - server-only client using the service role key.

### Entry points and guard logic

There are two entry points into `runScan()`, and auth is enforced on BOTH - the
manual flag never bypasses auth.

`app/api/scan/route.ts` (cron path):
1. ALWAYS require `Authorization: Bearer {CRON_SECRET}`. Reject otherwise. This is
   the only public entry point.
2. Compute current time in `America/New_York` via `Intl.DateTimeFormat` with
   `timeZone: "America/New_York"`. Proceed only if the ET hour is exactly 9. Do
   NOT also require a low minute value (Hobby cron fires anywhere within the
   scheduled hour).
3. Dedup: if a scan run already exists for today's ET date, return early.
4. Call `runScan({ isAutomatic: true })`.

Result: both UTC crons fire, but only the one landing in the 9 ET hour acts and
alerts.

Server action (manual path, in `app/page.tsx`):
- Runs server-side only; the secret is never shipped to the client and the action
  is not a public HTTP endpoint that accepts an arbitrary `manual:true` body.
- Calls `runScan({ isAutomatic: false })` directly. No ET-hour check and NO dedup,
  so the button can be pressed several times around 16:00 Israel to watch the list
  develop. Each press is a new run.

### Data source

`POST https://scan.tradingview.com/america/scan` with a browser User-Agent and
`Content-Type: application/json`. Request body filters `premarket_change > 90` and
`type == stock`, columns:
`name, description, close, premarket_change, premarket_volume, volume,
market_cap_basic, sector`, sorted by `premarket_change` desc, range `[0, 100]`.

Anonymous requests are delayed ~15 minutes (acceptable). Unofficial, undocumented
endpoint, against TradingView ToS, can break without notice. Field names are not
guaranteed - hence the single config constant. If a request errors on a field,
verify current names against the `tradingview-screener` Python library field
list and adjust.

Response shape: `{ totalCount, data: [ { s: "EXCHANGE:TICKER", d: [...values
in requested column order...] } ] }`. Map `d` by column index; split `s` to get
the clean ticker for the news lookup.

### Filtering and tagging

1. Keep rows with `premarket_change > 90`.
2. Tag each:
   - `market_cap_bucket`: micro (< 50M), small (50M-300M), mid_plus (> 300M)
   - `volume_thin`: true if pre-market volume is low relative to the move
     (configurable threshold). Thin volume + huge move = classic manipulation
     signature.
   - `price_bucket`: penny (< 5 USD) vs normal
3. Tags go into both the alert and the stored row.

### Catalyst classification

Per surviving ticker:
1. Pull last-48h company news from Finnhub
   (`/api/v1/company-news?symbol=...&from=...&to=...&token=...`).
2. Send headlines to Anthropic (model from config). Prompt instructs the model to
   return ONLY JSON, no preamble, no fences, exact shape:
   `{ "catalyst_type": "real" | "pump" | "dilution", "label_he": "<short Hebrew
   label>", "reason_he": "<one short Hebrew sentence>" }`
   - "real": material catalyst - FDA approval/decision, M&A, major
     contract/partnership, earnings beat, clinical trial results.
   - "dilution": any sign of offering, ATM program, registered direct, warrant
     exercise, or reverse split. RED FLAG, not bullish.
   - "pump": large move with no supporting news.
3. No headlines -> `catalyst_type: "pump"`, Hebrew reason noting no news found.
4. Parse defensively (strip fences, try/catch, neutral fallback on failure).

Rate limits: Finnhub free ~60/min; Anthropic has its own limits. Classify
sequentially or in small batches with simple retry/backoff.

## Storage (Supabase)

Table `premarket_scans` keeps intraday history: every run inserts its own rows so
repeated manual scans on the same day are all retained, and the intraday
development is visible over time.

- Add a `scan_run_id uuid not null` column, set once per `runScan()` call and
  shared by all tickers in that run.
- Conflict/unique target is `(scan_run_id, ticker)` (not `(scan_date, ticker)`).
  Upsert on that target gives idempotency within a single run (e.g. a retry of the
  same run updates rather than duplicates) while preserving history across runs.
- Live display reads the latest run: order by `scanned_at` desc, take the rows of
  the most recent `scan_run_id`.

Columns: id, scan_run_id, scan_date, scanned_at, ticker, company_name,
premarket_pct, price, premarket_volume, market_cap, market_cap_bucket,
volume_thin, price_bucket, sector, catalyst_type, catalyst_label_he,
catalyst_reason_he, source.

## Triggers

1. Vercel Cron (backup). Crons run in UTC and ignore DST, so register both
   `0 13 * * 1-5` and `0 14 * * 1-5` and guard inside the handler (ET hour === 9
   plus the dedup above).
2. On-demand (primary): a button in `app/page.tsx` whose server action calls
   `runScan({ isAutomatic: false })` directly server-side (no secret shipped to
   the client, not a public HTTP endpoint). No dedup, so it can be pressed
   repeatedly to watch the list develop. The page also reads the latest run from
   Supabase and shows it in a basic table.

## Telegram alert

- Send to chat id 522356436 via the Bot API `sendMessage`.
- Sort by premarket_pct desc.
- One block per ticker: ticker, +pct, price, human-formatted market cap (e.g.
  12.3M), pre-market volume, Hebrew catalyst label. Dilution gets a red-flag
  emoji, thin-volume gets a warning emoji.
- Message text in Hebrew; tickers and numbers inline.
- Zero results: short "no pre-market gappers above 90% today" message, gated by
  `SEND_EMPTY_ALERTS` (default true).

## Security

- `/api/scan` ALWAYS requires `Authorization: Bearer {CRON_SECRET}`. There is no
  body flag that bypasses this - the only way to skip the ET-hour check is the
  in-process server action, which is not a public HTTP endpoint.
- Manual button uses a server action that calls `runScan()` directly; the secret
  is never shipped to the browser.
- All secrets server-side. Never expose the Supabase service role key or the
  Anthropic key to the client.

## Env vars

`.env.local` and Vercel project settings:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- FINNHUB_API_KEY
- ANTHROPIC_API_KEY
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID (522356436)
- CRON_SECRET
- SEND_EMPTY_ALERTS (true/false, default true)

## File structure

- `app/api/scan/route.ts` - cron entry point (auth + ET-hour guard + dedup -> runScan)
- `lib/pipeline.ts` - shared `runScan()` orchestrator (fetch -> filter -> classify -> store -> alert)
- `lib/config.ts` - constants and TV field map
- `lib/tradingview.ts` - scan request + parsing
- `lib/finnhub.ts` - news fetch
- `lib/classify.ts` - Anthropic call
- `lib/telegram.ts` - alert formatting + send
- `lib/supabase.ts` - server client
- `app/page.tsx` - manual scan button + latest results table
- `vercel.json` - crons
- `supabase/migrations/0001_premarket_scans.sql`

## Delivery checkpoints

1. Migration SQL + project scaffold (Next.js 14, TS, deps, `.env.local.example`,
   `lib/config.ts`).
2. `lib/tradingview.ts` + a small runnable test script to hit the real endpoint
   and confirm parsing in isolation. The script takes an adjustable filter so it
   can be run NOW, on a weekend with the market closed: a "mechanical" mode drops
   the `premarket_change` condition (keeps `type == stock`, small range) to verify
   the request, parsing, and column-index mapping work, since `premarket_change`
   returns empty when the market is closed. A separate "premarket" mode keeps the
   `> 90` filter, to be verified specifically on a trading day during pre-market.
3. Remaining libs (finnhub, classify, telegram, supabase), `/api/scan` route,
   `app/page.tsx`, `vercel.json`, docs.

## Implementation notes

- Defensive parsing throughout: scanner can return null market cap, volume,
  sector.
- Clear console logging at each stage (fetched count, kept count, per-ticker
  classification, alert sent) so a manual run is easy to debug.
- Validate the full flow via the on-demand button on a weekday during US
  pre-market before relying on the cron.

## Out of scope (YAGNI)

- Trade execution, portfolio tracking.
- `float_shares_outstanding_current` column (often null on small caps) - can be
  added later behind the config constant.
