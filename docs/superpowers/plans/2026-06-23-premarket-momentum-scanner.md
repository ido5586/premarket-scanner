# US Pre-Market Momentum Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A scan-and-alert tool that finds US stocks up more than 90% pre-market, classifies each as real-catalyst / pump / dilution, stores results in Supabase, and pushes a Hebrew Telegram alert - triggered on demand (primary) and by Vercel cron (backup).

**Architecture:** Next.js 14 App Router + TypeScript. A shared `runScan()` orchestrator (`lib/pipeline.ts`) runs a linear pipeline: fetch TradingView -> filter >90% -> tag -> classify (Anthropic) -> insert (Supabase) -> alert (Telegram). It is called by both the cron route (`/api/scan`, always auth-gated) and the page's server action (manual). Pure logic (parsing, tagging, formatting, time, defensive JSON) lives in small focused modules with unit tests; external I/O modules are thin wrappers.

**Tech Stack:** Next.js 14, TypeScript, `@anthropic-ai/sdk`, `@supabase/supabase-js`, Vitest, Supabase Postgres, Vercel Cron, Telegram Bot API, Finnhub REST.

## Global Constraints

- Next.js 14 App Router + TypeScript. Dev command: `next dev --no-turbopack` (Windows Turbopack memory issue).
- Regular hyphens only everywhere - code, comments, UI text. No em dashes.
- Classifier model lives in ONE config constant. Default: `claude-haiku-4-5`.
- All TradingView field names / column order live in ONE config constant (`lib/config.ts`).
- All secrets server-side. Never expose Supabase service role key or Anthropic key to the browser.
- `/api/scan` ALWAYS requires `Authorization: Bearer {CRON_SECRET}`. No body flag bypasses auth.
- The `isAutomatic` flag controls only the ET-hour check and dedup, never auth.
- Defensive parsing throughout: scanner/news can return null fields.
- Storage preserves intraday history: every `runScan()` call gets one `scan_run_id` (UUID) shared by its rows; unique target is `(scan_run_id, ticker)`.
- Console logging at each stage (fetched count, kept count, per-ticker classification, alert sent).
- Target OS Windows; commands below use npm and run from the project root `d:/apps/Momentum system`.

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `next-env.d.ts`
- Create: `vitest.config.ts`
- Create: `.env.local.example`
- Create: `app/layout.tsx`
- Create: `app/globals.css`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a buildable Next.js 14 + TS project with `npm run dev`, `npm run build`, `npm test` scripts. Vitest configured for `lib/**/*.test.ts`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "premarket-momentum-scanner",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --no-turbopack",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "scan:tv": "tsx scripts/test-tradingview.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.40.0",
    "@supabase/supabase-js": "^2.45.0",
    "next": "14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.mjs`, `next-env.d.ts`, `app/globals.css`**

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`next-env.d.ts`:
```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

`app/globals.css`:
```css
:root { color-scheme: light dark; }
body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 14px; }
th { background: rgba(127,127,127,0.15); }
button { padding: 10px 16px; font-size: 15px; cursor: pointer; }
```

- [ ] **Step 4: Create `app/layout.tsx`**

```tsx
import "./globals.css";

export const metadata = {
  title: "Pre-Market Momentum Scanner",
  description: "Scan and alert for US pre-market gainers above 90 percent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 5: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 6: Create `.env.local.example`**

```bash
# Supabase - server-side only
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Finnhub free tier (about 60 requests/minute)
FINNHUB_API_KEY=your-finnhub-key

# Anthropic API (catalyst classification)
ANTHROPIC_API_KEY=your-anthropic-key

# Telegram bot
TELEGRAM_BOT_TOKEN=123456:your-bot-token
TELEGRAM_CHAT_ID=522356436

# Shared secret required on every /api/scan call
CRON_SECRET=generate-a-long-random-string

# Send a message even when zero gappers are found (true/false, default true)
SEND_EMPTY_ALERTS=true
```

- [ ] **Step 7: Install and verify the build**

Run: `npm install`
Then: `npm run build`
Expected: install succeeds; `next build` completes with no errors (an empty `app/` with only a layout builds; `app/page.tsx` arrives in Task 15). If `next build` complains about a missing page, that is expected until Task 15 - confirm the error is only the missing-page warning, not a TypeScript or config error.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 14 + TS project with Vitest and env template"
```

---

### Task 2: Supabase migration

**Files:**
- Create: `supabase/migrations/0001_premarket_scans.sql`

**Interfaces:**
- Produces: the `premarket_scans` table with `scan_run_id` and `unique (scan_run_id, ticker)`. Columns referenced by `lib/supabase.ts` in Task 12.

- [ ] **Step 1: Write the migration**

```sql
-- premarket_scans: one row per ticker per scan run.
-- Every runScan() call generates one scan_run_id (UUID) shared by all its rows,
-- so repeated manual scans on the same day are all retained (intraday history).
create table if not exists premarket_scans (
  id                  bigint generated always as identity primary key,
  scan_run_id         uuid        not null,
  scan_date           date        not null,
  scanned_at          timestamptz not null default now(),
  ticker              text        not null,
  company_name        text,
  premarket_pct       numeric,
  price               numeric,
  premarket_volume    bigint,
  market_cap          numeric,
  market_cap_bucket   text,
  volume_thin         boolean     default false,
  price_bucket        text,
  sector              text,
  catalyst_type       text,
  catalyst_label_he   text,
  catalyst_reason_he  text,
  source              text        default 'tradingview',
  unique (scan_run_id, ticker)
);

-- Fast lookup of the latest run and per-day history.
create index if not exists premarket_scans_scanned_at_idx
  on premarket_scans (scanned_at desc);
create index if not exists premarket_scans_scan_date_idx
  on premarket_scans (scan_date);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0001_premarket_scans.sql
git commit -m "Add premarket_scans migration with scan_run_id for intraday history"
```

(Apply this SQL in the Supabase SQL editor before running the full pipeline in Task 13+. Not required for unit tests.)

---

### Task 3: Config constants

**Files:**
- Create: `lib/config.ts`

**Interfaces:**
- Produces:
  - `TV_COLUMNS: readonly string[]` - exact TradingView column order.
  - `TV_FILTERS` - the field/operation/value filter objects.
  - `TV_SCAN_URL: string`, `TV_USER_AGENT: string`.
  - `CLASSIFIER_MODEL: string` (default `"claude-haiku-4-5"`).
  - `MARKET_CAP_MICRO_MAX = 50_000_000`, `MARKET_CAP_SMALL_MAX = 300_000_000`.
  - `PENNY_PRICE_MAX = 5`.
  - `THIN_VOLUME_MAX = 1_000_000` (pre-market volume at or below this with a >90% move is flagged thin).
  - `MIN_PREMARKET_PCT = 90`.
  - `TELEGRAM_API_BASE = "https://api.telegram.org"`.
  - `FINNHUB_API_BASE = "https://finnhub.io/api/v1"`.

- [ ] **Step 1: Write `lib/config.ts`**

```ts
// Single source of truth for values likely to change or break.

// TradingView scanner column order. The response "d" array maps to this by index.
// If a request errors on a field, verify names against the tradingview-screener
// Python library field list and adjust here only.
export const TV_COLUMNS = [
  "name",
  "description",
  "close",
  "premarket_change",
  "premarket_volume",
  "volume",
  "market_cap_basic",
  "sector",
] as const;

export const TV_FILTERS = [
  { left: "premarket_change", operation: "greater", right: 90 },
  { left: "type", operation: "equal", right: "stock" },
] as const;

export const TV_SCAN_URL = "https://scan.tradingview.com/america/scan";
export const TV_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Anthropic model for catalyst classification. Swap to "claude-sonnet-4-6" for
// higher quality at higher cost.
export const CLASSIFIER_MODEL = "claude-haiku-4-5";

// Filtering and tagging thresholds.
export const MIN_PREMARKET_PCT = 90;
export const MARKET_CAP_MICRO_MAX = 50_000_000;
export const MARKET_CAP_SMALL_MAX = 300_000_000;
export const PENNY_PRICE_MAX = 5;
export const THIN_VOLUME_MAX = 1_000_000;

export const TELEGRAM_API_BASE = "https://api.telegram.org";
export const FINNHUB_API_BASE = "https://finnhub.io/api/v1";
```

- [ ] **Step 2: Commit**

```bash
git add lib/config.ts
git commit -m "Add central config constants and TradingView field map"
```

---

### Task 4: TradingView fetch and parse

**Files:**
- Create: `lib/tradingview.ts`
- Test: `lib/tradingview.test.ts`

**Interfaces:**
- Consumes: `TV_COLUMNS`, `TV_FILTERS`, `TV_SCAN_URL`, `TV_USER_AGENT` from `lib/config.ts`.
- Produces:
  - `type ScanRow = { ticker: string; exchange: string; name: string | null; companyName: string | null; price: number | null; premarketPct: number | null; premarketVolume: number | null; volume: number | null; marketCap: number | null; sector: string | null }`
  - `buildScanRequest(opts?: { includePremarketFilter?: boolean; range?: [number, number] }): object` - the POST body. Default `includePremarketFilter: true`, `range: [0, 100]`.
  - `parseScanResponse(json: unknown): ScanRow[]` - maps `data[].d` by column index, splits `s` into exchange/ticker, defensive against nulls and missing fields.
  - `fetchScan(opts?): Promise<ScanRow[]>` - POSTs and parses.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildScanRequest, parseScanResponse } from "./tradingview";

describe("buildScanRequest", () => {
  it("includes the premarket filter by default", () => {
    const body = buildScanRequest() as any;
    expect(body.filter).toContainEqual({
      left: "premarket_change",
      operation: "greater",
      right: 90,
    });
    expect(body.columns).toContain("premarket_change");
    expect(body.range).toEqual([0, 100]);
  });

  it("drops the premarket filter in mechanical mode but keeps the stock type filter", () => {
    const body = buildScanRequest({ includePremarketFilter: false, range: [0, 5] }) as any;
    expect(body.filter).not.toContainEqual(
      expect.objectContaining({ left: "premarket_change" }),
    );
    expect(body.filter).toContainEqual({ left: "type", operation: "equal", right: "stock" });
    expect(body.range).toEqual([0, 5]);
  });
});

describe("parseScanResponse", () => {
  it("maps the d array by column index and splits EXCHANGE:TICKER", () => {
    const json = {
      totalCount: 1,
      data: [
        {
          s: "NASDAQ:XYZ",
          d: ["XYZ", "Xyz Corp", 3.21, 152.4, 800000, 2500000, 42000000, "Health Technology"],
        },
      ],
    };
    const rows = parseScanResponse(json);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      ticker: "XYZ",
      exchange: "NASDAQ",
      name: "XYZ",
      companyName: "Xyz Corp",
      price: 3.21,
      premarketPct: 152.4,
      premarketVolume: 800000,
      volume: 2500000,
      marketCap: 42000000,
      sector: "Health Technology",
    });
  });

  it("handles null fields and missing data array defensively", () => {
    expect(parseScanResponse({})).toEqual([]);
    expect(parseScanResponse({ data: null })).toEqual([]);
    const rows = parseScanResponse({
      data: [{ s: "NYSE:ABC", d: ["ABC", "Abc Inc", null, 95.0, null, null, null, null] }],
    });
    expect(rows[0].ticker).toBe("ABC");
    expect(rows[0].price).toBeNull();
    expect(rows[0].marketCap).toBeNull();
    expect(rows[0].sector).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL - `buildScanRequest`/`parseScanResponse` not exported.

- [ ] **Step 3: Write `lib/tradingview.ts`**

```ts
import {
  TV_COLUMNS,
  TV_FILTERS,
  TV_SCAN_URL,
  TV_USER_AGENT,
} from "./config";

export type ScanRow = {
  ticker: string;
  exchange: string;
  name: string | null;
  companyName: string | null;
  price: number | null;
  premarketPct: number | null;
  premarketVolume: number | null;
  volume: number | null;
  marketCap: number | null;
  sector: string | null;
};

type BuildOpts = {
  includePremarketFilter?: boolean;
  range?: [number, number];
};

export function buildScanRequest(opts: BuildOpts = {}): object {
  const includePremarketFilter = opts.includePremarketFilter ?? true;
  const range = opts.range ?? [0, 100];
  const filter = includePremarketFilter
    ? [...TV_FILTERS]
    : TV_FILTERS.filter((f) => f.left !== "premarket_change");
  return {
    filter,
    options: { lang: "en" },
    markets: ["america"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: [...TV_COLUMNS],
    sort: { sortBy: "premarket_change", sortOrder: "desc" },
    range,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function parseScanResponse(json: unknown): ScanRow[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const idx = (col: string) => TV_COLUMNS.indexOf(col as (typeof TV_COLUMNS)[number]);
  const rows: ScanRow[] = [];
  for (const entry of data) {
    const s = (entry as { s?: unknown })?.s;
    const d = (entry as { d?: unknown })?.d;
    if (typeof s !== "string" || !Array.isArray(d)) continue;
    const [exchange, ticker] = s.includes(":") ? s.split(":") : ["", s];
    if (!ticker) continue;
    rows.push({
      ticker,
      exchange,
      name: str(d[idx("name")]),
      companyName: str(d[idx("description")]),
      price: num(d[idx("close")]),
      premarketPct: num(d[idx("premarket_change")]),
      premarketVolume: num(d[idx("premarket_volume")]),
      volume: num(d[idx("volume")]),
      marketCap: num(d[idx("market_cap_basic")]),
      sector: str(d[idx("sector")]),
    });
  }
  return rows;
}

export async function fetchScan(opts: BuildOpts = {}): Promise<ScanRow[]> {
  const res = await fetch(TV_SCAN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": TV_USER_AGENT,
    },
    body: JSON.stringify(buildScanRequest(opts)),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`TradingView scan failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const rows = parseScanResponse(json);
  console.log(`[tradingview] fetched ${rows.length} rows (status ${res.status})`);
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS - all `tradingview` tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/tradingview.ts lib/tradingview.test.ts
git commit -m "Add TradingView scan request builder, parser, and fetch with tests"
```

---

### Task 5: Isolated TradingView test script (runnable now)

**Files:**
- Create: `scripts/test-tradingview.ts`

**Interfaces:**
- Consumes: `fetchScan` from `lib/tradingview.ts`.
- Produces: a CLI script runnable via `npm run scan:tv` (mechanical mode, weekend-safe) or `npm run scan:tv -- --premarket` (live pre-market mode).

- [ ] **Step 1: Write `scripts/test-tradingview.ts`**

```ts
// Manual verification of the TradingView endpoint and parser.
//
// Weekend / market closed: run mechanical mode (default). It drops the
// premarket_change filter so the request, parsing, and column-index mapping can
// be checked even when premarket_change returns empty.
//   npm run scan:tv
//
// Trading day, US pre-market: verify the real >90% filter.
//   npm run scan:tv -- --premarket
import { fetchScan } from "../lib/tradingview";

async function main() {
  const premarket = process.argv.includes("--premarket");
  const mode = premarket ? "premarket (filter >90%)" : "mechanical (no premarket filter)";
  console.log(`Running TradingView test in ${mode} mode...`);

  const rows = await fetchScan(
    premarket
      ? { includePremarketFilter: true, range: [0, 100] }
      : { includePremarketFilter: false, range: [0, 10] },
  );

  console.log(`Parsed ${rows.length} rows. First few:`);
  for (const r of rows.slice(0, 10)) {
    console.log(
      `${r.exchange}:${r.ticker}  pre%=${r.premarketPct}  price=${r.price}  ` +
        `cap=${r.marketCap}  preVol=${r.premarketVolume}  sector=${r.sector}`,
    );
  }
  if (rows.length === 0) {
    console.log(
      "No rows. In mechanical mode this likely means a field name changed - " +
        "verify TV_COLUMNS/TV_FILTERS against the tradingview-screener field list.",
    );
  }
}

main().catch((err) => {
  console.error("Test script failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the script in mechanical mode**

Run: `npm run scan:tv`
Expected: prints parsed rows (up to 10 US stocks) with non-null `price`/`marketCap`/`sector` for most. If 0 rows, the endpoint or a field name changed - investigate before continuing. This is the Checkpoint 2 verification and works on a weekend.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-tradingview.ts
git commit -m "Add runnable TradingView test script with mechanical and premarket modes"
```

**>>> CHECKPOINT 2 ends here. Confirm `npm run scan:tv` returns parsed rows before continuing.**

---

### Task 6: Tagging logic

**Files:**
- Create: `lib/tagging.ts`
- Test: `lib/tagging.test.ts`

**Interfaces:**
- Consumes: `MARKET_CAP_MICRO_MAX`, `MARKET_CAP_SMALL_MAX`, `PENNY_PRICE_MAX`, `THIN_VOLUME_MAX` from `lib/config.ts`; `ScanRow` type from `lib/tradingview.ts`.
- Produces:
  - `type Tags = { marketCapBucket: "micro" | "small" | "mid_plus" | "unknown"; volumeThin: boolean; priceBucket: "penny" | "normal" | "unknown" }`
  - `tagRow(row: ScanRow): Tags`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { tagRow } from "./tagging";
import type { ScanRow } from "./tradingview";

function row(partial: Partial<ScanRow>): ScanRow {
  return {
    ticker: "T", exchange: "NASDAQ", name: "T", companyName: "T Inc",
    price: 10, premarketPct: 120, premarketVolume: 5_000_000,
    volume: 10_000_000, marketCap: 100_000_000, sector: "Tech",
    ...partial,
  };
}

describe("tagRow", () => {
  it("buckets market cap", () => {
    expect(tagRow(row({ marketCap: 20_000_000 })).marketCapBucket).toBe("micro");
    expect(tagRow(row({ marketCap: 100_000_000 })).marketCapBucket).toBe("small");
    expect(tagRow(row({ marketCap: 500_000_000 })).marketCapBucket).toBe("mid_plus");
    expect(tagRow(row({ marketCap: null })).marketCapBucket).toBe("unknown");
  });

  it("buckets price", () => {
    expect(tagRow(row({ price: 3 })).priceBucket).toBe("penny");
    expect(tagRow(row({ price: 50 })).priceBucket).toBe("normal");
    expect(tagRow(row({ price: null })).priceBucket).toBe("unknown");
  });

  it("flags thin volume only when volume is at or below the threshold", () => {
    expect(tagRow(row({ premarketVolume: 500_000 })).volumeThin).toBe(true);
    expect(tagRow(row({ premarketVolume: 5_000_000 })).volumeThin).toBe(false);
  });

  it("does not flag thin volume when premarket volume is unknown", () => {
    expect(tagRow(row({ premarketVolume: null })).volumeThin).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL - `tagRow` not exported.

- [ ] **Step 3: Write `lib/tagging.ts`**

```ts
import {
  MARKET_CAP_MICRO_MAX,
  MARKET_CAP_SMALL_MAX,
  PENNY_PRICE_MAX,
  THIN_VOLUME_MAX,
} from "./config";
import type { ScanRow } from "./tradingview";

export type Tags = {
  marketCapBucket: "micro" | "small" | "mid_plus" | "unknown";
  volumeThin: boolean;
  priceBucket: "penny" | "normal" | "unknown";
};

export function tagRow(row: ScanRow): Tags {
  let marketCapBucket: Tags["marketCapBucket"] = "unknown";
  if (row.marketCap != null) {
    if (row.marketCap < MARKET_CAP_MICRO_MAX) marketCapBucket = "micro";
    else if (row.marketCap <= MARKET_CAP_SMALL_MAX) marketCapBucket = "small";
    else marketCapBucket = "mid_plus";
  }

  let priceBucket: Tags["priceBucket"] = "unknown";
  if (row.price != null) {
    priceBucket = row.price < PENNY_PRICE_MAX ? "penny" : "normal";
  }

  // Thin volume plus a huge move is a classic manipulation signature.
  // Only flag when we actually have a volume number.
  const volumeThin =
    row.premarketVolume != null && row.premarketVolume <= THIN_VOLUME_MAX;

  return { marketCapBucket, volumeThin, priceBucket };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tagging.ts lib/tagging.test.ts
git commit -m "Add market-cap/price/thin-volume tagging with tests"
```

---

### Task 7: Number and date formatting helpers

**Files:**
- Create: `lib/format.ts`
- Test: `lib/format.test.ts`

**Interfaces:**
- Produces:
  - `formatMarketCap(n: number | null): string` - e.g. `12300000 -> "12.3M"`, `2_500_000_000 -> "2.5B"`, `null -> "?"`.
  - `formatVolume(n: number | null): string` - thousands separators, `null -> "?"`.
  - `formatPct(n: number | null): string` - e.g. `152.37 -> "+152%"`, `null -> "?"`.
  - `formatPrice(n: number | null): string` - e.g. `3.2 -> "$3.20"`, `null -> "?"`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatMarketCap, formatVolume, formatPct, formatPrice } from "./format";

describe("formatMarketCap", () => {
  it("formats millions and billions", () => {
    expect(formatMarketCap(12_300_000)).toBe("12.3M");
    expect(formatMarketCap(2_500_000_000)).toBe("2.5B");
    expect(formatMarketCap(950_000)).toBe("0.95M");
    expect(formatMarketCap(null)).toBe("?");
  });
});

describe("formatVolume", () => {
  it("groups thousands and handles null", () => {
    expect(formatVolume(1234567)).toBe("1,234,567");
    expect(formatVolume(null)).toBe("?");
  });
});

describe("formatPct", () => {
  it("rounds and signs", () => {
    expect(formatPct(152.37)).toBe("+152%");
    expect(formatPct(null)).toBe("?");
  });
});

describe("formatPrice", () => {
  it("two decimals with a dollar sign", () => {
    expect(formatPrice(3.2)).toBe("$3.20");
    expect(formatPrice(null)).toBe("?");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL - functions not exported.

- [ ] **Step 3: Write `lib/format.ts`**

```ts
export function formatMarketCap(n: number | null): string {
  if (n == null) return "?";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`;
}

export function formatVolume(n: number | null): string {
  if (n == null) return "?";
  return Math.round(n).toLocaleString("en-US");
}

export function formatPct(n: number | null): string {
  if (n == null) return "?";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${Math.round(n)}%`;
}

export function formatPrice(n: number | null): string {
  if (n == null) return "?";
  return `$${n.toFixed(2)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS. (Note `formatMarketCap(950_000)` -> `0.95M` because 950000/1e6 = 0.95 and 950000 < 10,000,000 uses 2 decimals.)

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts lib/format.test.ts
git commit -m "Add human-readable number formatting helpers with tests"
```

---

### Task 8: Eastern Time helpers

**Files:**
- Create: `lib/time.ts`
- Test: `lib/time.test.ts`

**Interfaces:**
- Produces:
  - `getEtParts(now?: Date): { hour: number; date: string }` - ET hour (0-23) and ET calendar date `YYYY-MM-DD`, computed via `Intl.DateTimeFormat` with `timeZone: "America/New_York"`.
  - `isNineEtHour(now?: Date): boolean` - true when the ET hour is exactly 9.
  - `finnhubDateRange(now?: Date): { from: string; to: string }` - `to` is today's ET date, `from` is 2 days earlier (last 48h window), both `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getEtParts, isNineEtHour, finnhubDateRange } from "./time";

describe("getEtParts", () => {
  it("converts a known UTC instant to ET (summer, EDT = UTC-4)", () => {
    // 2026-06-23 13:30 UTC == 09:30 EDT
    const d = new Date("2026-06-23T13:30:00Z");
    expect(getEtParts(d)).toEqual({ hour: 9, date: "2026-06-23" });
  });

  it("converts a known UTC instant to ET (winter, EST = UTC-5)", () => {
    // 2026-01-15 14:30 UTC == 09:30 EST
    const d = new Date("2026-01-15T14:30:00Z");
    expect(getEtParts(d)).toEqual({ hour: 9, date: "2026-01-15" });
  });
});

describe("isNineEtHour", () => {
  it("is true at 09:05 ET and false at 10:00 ET", () => {
    expect(isNineEtHour(new Date("2026-06-23T13:05:00Z"))).toBe(true); // 09:05 EDT
    expect(isNineEtHour(new Date("2026-06-23T14:00:00Z"))).toBe(false); // 10:00 EDT
  });
});

describe("finnhubDateRange", () => {
  it("spans the last 48h ending on the ET date", () => {
    const d = new Date("2026-06-23T13:30:00Z"); // 2026-06-23 ET
    expect(finnhubDateRange(d)).toEqual({ from: "2026-06-21", to: "2026-06-23" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL - helpers not exported.

- [ ] **Step 3: Write `lib/time.ts`**

```ts
// All ET conversions go through Intl with timeZone America/New_York so DST is
// handled automatically (no manual offset math).

export function getEtParts(now: Date = new Date()): { hour: number; date: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // Intl can emit "24" for midnight in some runtimes; normalize to 0.
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;
  return { hour, date: `${year}-${month}-${day}` };
}

export function isNineEtHour(now: Date = new Date()): boolean {
  return getEtParts(now).hour === 9;
}

export function finnhubDateRange(now: Date = new Date()): { from: string; to: string } {
  const { date } = getEtParts(now);
  const to = date;
  const [y, m, d] = date.split("-").map((v) => parseInt(v, 10));
  // Build the ET calendar date at noon UTC to avoid edge rollovers, then subtract 2 days.
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() - 2);
  const from = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(
    base.getUTCDate(),
  ).padStart(2, "0")}`;
  return { from, to };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/time.ts lib/time.test.ts
git commit -m "Add ET time helpers (hour guard, scan date, Finnhub 48h range) with tests"
```

---

### Task 9: Finnhub news fetch

**Files:**
- Create: `lib/finnhub.ts`

**Interfaces:**
- Consumes: `FINNHUB_API_BASE` from `lib/config.ts`; `finnhubDateRange` from `lib/time.ts`.
- Produces:
  - `type Headline = { headline: string; summary: string; datetime: number }`
  - `fetchCompanyNews(ticker: string, now?: Date): Promise<Headline[]>` - last 48h company news, defensive against empty/error responses (returns `[]` on any failure or non-array body). Reads `FINNHUB_API_KEY` from `process.env`.

- [ ] **Step 1: Write `lib/finnhub.ts`**

```ts
import { FINNHUB_API_BASE } from "./config";
import { finnhubDateRange } from "./time";

export type Headline = {
  headline: string;
  summary: string;
  datetime: number;
};

export async function fetchCompanyNews(
  ticker: string,
  now: Date = new Date(),
): Promise<Headline[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    console.warn("[finnhub] FINNHUB_API_KEY not set; returning no headlines");
    return [];
  }
  const { from, to } = finnhubDateRange(now);
  const url = `${FINNHUB_API_BASE}/company-news?symbol=${encodeURIComponent(
    ticker,
  )}&from=${from}&to=${to}&token=${token}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[finnhub] ${ticker} news request failed: ${res.status}`);
      return [];
    }
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    const headlines: Headline[] = json
      .map((item) => ({
        headline: typeof item?.headline === "string" ? item.headline : "",
        summary: typeof item?.summary === "string" ? item.summary : "",
        datetime: typeof item?.datetime === "number" ? item.datetime : 0,
      }))
      .filter((h) => h.headline.length > 0);
    console.log(`[finnhub] ${ticker}: ${headlines.length} headlines`);
    return headlines;
  } catch (err) {
    console.warn(`[finnhub] ${ticker} news error:`, err);
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/finnhub.ts
git commit -m "Add Finnhub company-news fetch with defensive empty handling"
```

(No unit test: this module is a thin network wrapper. Its date-range and tolerance logic are covered by `lib/time.test.ts` and exercised end to end in the manual run.)

---

### Task 10: Anthropic catalyst classification

**Files:**
- Create: `lib/classify.ts`
- Test: `lib/classify.test.ts`

**Interfaces:**
- Consumes: `CLASSIFIER_MODEL` from `lib/config.ts`; `Headline` from `lib/finnhub.ts`.
- Produces:
  - `type Catalyst = { catalystType: "real" | "pump" | "dilution"; labelHe: string; reasonHe: string }`
  - `parseCatalystJson(raw: string): Catalyst` - strips stray markdown fences, `JSON.parse` in try/catch, validates `catalystType`, neutral fallback on any failure. Exported for unit testing.
  - `classifyTicker(ticker: string, headlines: Headline[]): Promise<Catalyst>` - no headlines -> `pump` with a Hebrew "no news" reason; otherwise calls Anthropic with a JSON-only prompt and parses defensively. Reads `ANTHROPIC_API_KEY` from `process.env`.

- [ ] **Step 1: Write the failing test (pure parser only)**

```ts
import { describe, it, expect } from "vitest";
import { parseCatalystJson } from "./classify";

describe("parseCatalystJson", () => {
  it("parses clean JSON", () => {
    const out = parseCatalystJson(
      '{"catalyst_type":"real","label_he":"אישור FDA","reason_he":"קיבלה אישור FDA לתרופה"}',
    );
    expect(out.catalystType).toBe("real");
    expect(out.labelHe).toBe("אישור FDA");
    expect(out.reasonHe).toBe("קיבלה אישור FDA לתרופה");
  });

  it("strips markdown fences", () => {
    const raw = '```json\n{"catalyst_type":"dilution","label_he":"דילול","reason_he":"הנפקה"}\n```';
    expect(parseCatalystJson(raw).catalystType).toBe("dilution");
  });

  it("falls back to a neutral label on invalid JSON", () => {
    const out = parseCatalystJson("not json at all");
    expect(out.catalystType).toBe("pump");
    expect(out.labelHe.length).toBeGreaterThan(0);
    expect(out.reasonHe.length).toBeGreaterThan(0);
  });

  it("falls back when catalyst_type is not one of the allowed values", () => {
    const out = parseCatalystJson('{"catalyst_type":"banana","label_he":"x","reason_he":"y"}');
    expect(out.catalystType).toBe("pump");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL - `parseCatalystJson` not exported.

- [ ] **Step 3: Write `lib/classify.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFIER_MODEL } from "./config";
import type { Headline } from "./finnhub";

export type Catalyst = {
  catalystType: "real" | "pump" | "dilution";
  labelHe: string;
  reasonHe: string;
};

const NEUTRAL_FALLBACK: Catalyst = {
  catalystType: "pump",
  labelHe: "לא ידוע",
  reasonHe: "לא ניתן לסווג את החדשות",
};

const NO_NEWS: Catalyst = {
  catalystType: "pump",
  labelHe: "אין חדשות",
  reasonHe: "לא נמצאו חדשות תומכות בעלייה",
};

export function parseCatalystJson(raw: string): Catalyst {
  try {
    const cleaned = raw
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    const type = obj.catalyst_type;
    if (type !== "real" && type !== "pump" && type !== "dilution") {
      return NEUTRAL_FALLBACK;
    }
    const labelHe = typeof obj.label_he === "string" && obj.label_he.length > 0
      ? obj.label_he
      : NEUTRAL_FALLBACK.labelHe;
    const reasonHe = typeof obj.reason_he === "string" && obj.reason_he.length > 0
      ? obj.reason_he
      : NEUTRAL_FALLBACK.reasonHe;
    return { catalystType: type, labelHe, reasonHe };
  } catch {
    return NEUTRAL_FALLBACK;
  }
}

const SYSTEM_PROMPT = [
  "You classify why a US stock is spiking pre-market, using its recent news headlines.",
  "Return ONLY a JSON object, no preamble and no markdown fences, in exactly this shape:",
  '{ "catalyst_type": "real" | "pump" | "dilution", "label_he": "<short Hebrew label>", "reason_he": "<one short Hebrew sentence>" }',
  "Classification guidance:",
  '- "real": a material catalyst such as an FDA approval or decision, a merger or acquisition, a major contract or partnership, an earnings beat, or clinical trial results.',
  '- "dilution": any sign of a stock offering, ATM program, registered direct, warrant exercise, or reverse split. Treat this as a RED FLAG, not bullish.',
  '- "pump": a large move with no supporting news.',
  "label_he and reason_he must be in Hebrew and short.",
].join("\n");

export async function classifyTicker(
  ticker: string,
  headlines: Headline[],
): Promise<Catalyst> {
  if (headlines.length === 0) {
    console.log(`[classify] ${ticker}: no headlines -> pump`);
    return NO_NEWS;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[classify] ANTHROPIC_API_KEY not set; using neutral fallback");
    return NEUTRAL_FALLBACK;
  }

  const client = new Anthropic({ apiKey });
  const headlineText = headlines
    .slice(0, 15)
    .map((h, i) => `${i + 1}. ${h.headline}${h.summary ? " - " + h.summary : ""}`)
    .join("\n");

  const userContent =
    `Ticker: ${ticker}\nRecent headlines (last 48h):\n${headlineText}\n\n` +
    "Classify and respond with the JSON object only.";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.messages.create({
        model: CLASSIFIER_MODEL,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });
      const block = res.content.find((b) => b.type === "text");
      const text = block && block.type === "text" ? block.text : "";
      const out = parseCatalystJson(text);
      console.log(`[classify] ${ticker}: ${out.catalystType} (${out.labelHe})`);
      return out;
    } catch (err) {
      const wait = 500 * (attempt + 1);
      console.warn(`[classify] ${ticker} attempt ${attempt + 1} failed, retrying in ${wait}ms`, err);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  console.warn(`[classify] ${ticker}: all attempts failed -> neutral fallback`);
  return NEUTRAL_FALLBACK;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS - parser tests green. (The network path of `classifyTicker` is verified in the manual run, not unit-tested.)

- [ ] **Step 5: Commit**

```bash
git add lib/classify.ts lib/classify.test.ts
git commit -m "Add Anthropic catalyst classification with defensive JSON parsing"
```

---

### Task 11: Telegram alert formatting and send

**Files:**
- Create: `lib/telegram.ts`
- Test: `lib/telegram.test.ts`

**Interfaces:**
- Consumes: `TELEGRAM_API_BASE` from `lib/config.ts`; `formatMarketCap`, `formatVolume`, `formatPct`, `formatPrice` from `lib/format.ts`.
- Produces:
  - `type AlertItem = { ticker: string; premarketPct: number | null; price: number | null; marketCap: number | null; premarketVolume: number | null; volumeThin: boolean; catalystType: "real" | "pump" | "dilution"; catalystLabelHe: string }`
  - `buildAlertMessage(items: AlertItem[]): string` - Hebrew message, sorted by `premarketPct` desc, one block per ticker, dilution gets 🚩, thin volume gets ⚠️. Empty list -> the "no gappers" Hebrew message. Exported for testing.
  - `sendTelegram(text: string): Promise<void>` - posts to the Bot API; reads `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `process.env`.
  - `sendAlert(items: AlertItem[]): Promise<void>` - builds the message and, when the list is empty, sends only if `SEND_EMPTY_ALERTS` is not `"false"`.

- [ ] **Step 1: Write the failing test (formatter only)**

```ts
import { describe, it, expect } from "vitest";
import { buildAlertMessage, type AlertItem } from "./telegram";

function item(p: Partial<AlertItem>): AlertItem {
  return {
    ticker: "AAA", premarketPct: 120, price: 4, marketCap: 30_000_000,
    premarketVolume: 800_000, volumeThin: false, catalystType: "pump",
    catalystLabelHe: "אין חדשות", ...p,
  };
}

describe("buildAlertMessage", () => {
  it("sorts by premarket pct descending and includes each ticker", () => {
    const msg = buildAlertMessage([
      item({ ticker: "LOW", premarketPct: 95 }),
      item({ ticker: "HIGH", premarketPct: 300 }),
    ]);
    expect(msg.indexOf("HIGH")).toBeLessThan(msg.indexOf("LOW"));
    expect(msg).toContain("HIGH");
    expect(msg).toContain("LOW");
  });

  it("marks dilution with a red flag and thin volume with a warning", () => {
    const msg = buildAlertMessage([
      item({ ticker: "DIL", catalystType: "dilution" }),
      item({ ticker: "THN", volumeThin: true }),
    ]);
    const dilLine = msg.split("\n").find((l) => l.includes("DIL")) ?? "";
    const thnLine = msg.split("\n").find((l) => l.includes("THN")) ?? "";
    expect(dilLine).toContain("🚩");
    expect(thnLine).toContain("⚠️");
  });

  it("returns the no-gappers Hebrew message for an empty list", () => {
    const msg = buildAlertMessage([]);
    expect(msg).toContain("90%");
    expect(msg.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL - `buildAlertMessage` not exported.

- [ ] **Step 3: Write `lib/telegram.ts`**

```ts
import { TELEGRAM_API_BASE } from "./config";
import { formatMarketCap, formatVolume, formatPct, formatPrice } from "./format";

export type AlertItem = {
  ticker: string;
  premarketPct: number | null;
  price: number | null;
  marketCap: number | null;
  premarketVolume: number | null;
  volumeThin: boolean;
  catalystType: "real" | "pump" | "dilution";
  catalystLabelHe: string;
};

const NO_GAPPERS = "אין מניות פרה-מרקט עם עלייה מעל 90% היום.";

export function buildAlertMessage(items: AlertItem[]): string {
  if (items.length === 0) return NO_GAPPERS;

  const sorted = [...items].sort(
    (a, b) => (b.premarketPct ?? 0) - (a.premarketPct ?? 0),
  );

  const header = `🚀 מניות פרה-מרקט מעל 90% (${sorted.length})`;
  const blocks = sorted.map((it) => {
    const flags: string[] = [];
    if (it.catalystType === "dilution") flags.push("🚩");
    if (it.volumeThin) flags.push("⚠️");
    const flagStr = flags.length ? " " + flags.join("") : "";
    const lines = [
      `${it.ticker} ${formatPct(it.premarketPct)}${flagStr}`,
      `מחיר: ${formatPrice(it.price)} | שווי שוק: ${formatMarketCap(it.marketCap)} | נפח פרה-מרקט: ${formatVolume(it.premarketVolume)}`,
      `קטליסט: ${it.catalystLabelHe}`,
    ];
    return lines.join("\n");
  });

  return [header, ...blocks].join("\n\n");
}

export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] token or chat id missing; skipping send");
    return;
  }
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[telegram] send failed: ${res.status} ${body}`);
    return;
  }
  console.log("[telegram] alert sent");
}

export async function sendAlert(items: AlertItem[]): Promise<void> {
  if (items.length === 0 && process.env.SEND_EMPTY_ALERTS === "false") {
    console.log("[telegram] no gappers and SEND_EMPTY_ALERTS=false; not sending");
    return;
  }
  await sendTelegram(buildAlertMessage(items));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/telegram.ts lib/telegram.test.ts
git commit -m "Add Telegram Hebrew alert formatting and send with tests"
```

---

### Task 12: Supabase server client and storage

**Files:**
- Create: `lib/supabase.ts`

**Interfaces:**
- Consumes: nothing from prior tasks except env vars.
- Produces:
  - `type ScanRecord = { scan_run_id: string; scan_date: string; ticker: string; company_name: string | null; premarket_pct: number | null; price: number | null; premarket_volume: number | null; market_cap: number | null; market_cap_bucket: string; volume_thin: boolean; price_bucket: string; sector: string | null; catalyst_type: string; catalyst_label_he: string; catalyst_reason_he: string }`
  - `getServerClient(): SupabaseClient` - service-role client, server-only.
  - `insertScanRecords(records: ScanRecord[]): Promise<void>` - upsert on `(scan_run_id, ticker)`.
  - `hasScanForDate(date: string): Promise<boolean>` - true if any row exists with `scan_date = date` (used by the cron dedup).
  - `getLatestRun(): Promise<ScanRecord[]>` - rows of the most recent `scan_run_id` (ordered by `scanned_at` desc), for the UI table.

- [ ] **Step 1: Write `lib/supabase.ts`**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase.ts
git commit -m "Add Supabase server client, run-scoped insert, dedup, and latest-run read"
```

---

### Task 13: Pipeline orchestrator (runScan)

**Files:**
- Create: `lib/pipeline.ts`

**Interfaces:**
- Consumes: `fetchScan`/`ScanRow` (`lib/tradingview.ts`), `tagRow` (`lib/tagging.ts`), `fetchCompanyNews` (`lib/finnhub.ts`), `classifyTicker` (`lib/classify.ts`), `insertScanRecords`/`ScanRecord` (`lib/supabase.ts`), `sendAlert`/`AlertItem` (`lib/telegram.ts`), `getEtParts` (`lib/time.ts`), `MIN_PREMARKET_PCT` (`lib/config.ts`).
- Produces:
  - `type RunResult = { scanRunId: string; kept: number; fetched: number; items: AlertItem[] }`
  - `runScan(opts?: { isAutomatic?: boolean; now?: Date }): Promise<RunResult>` - the shared orchestrator. Generates one `scan_run_id` via `crypto.randomUUID()`, runs the full pipeline, classifies sequentially (rate-limit friendly), inserts, and alerts. `isAutomatic` is accepted for symmetry/logging; the ET-hour and dedup gating live in the route (Task 14), so `runScan` itself always runs.

- [ ] **Step 1: Write `lib/pipeline.ts`**

```ts
import { randomUUID } from "node:crypto";
import { fetchScan } from "./tradingview";
import { tagRow } from "./tagging";
import { fetchCompanyNews } from "./finnhub";
import { classifyTicker } from "./classify";
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
    const headlines = await fetchCompanyNews(row.ticker, now);
    const catalyst = await classifyTicker(row.ticker, headlines);

    records.push({
      scan_run_id: scanRunId,
      scan_date: scanDate,
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
    });
  }

  await insertScanRecords(records);
  await sendAlert(items);

  console.log(`[pipeline] runScan done run=${scanRunId} kept=${kept.length}`);
  return { scanRunId, fetched: rows.length, kept: kept.length, items };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: builds without TypeScript errors (the route and page arrive next; if `next build` warns only about the missing `app/page.tsx`, that is fine until Task 15).

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline.ts
git commit -m "Add runScan pipeline orchestrator with run-scoped id and sequential classify"
```

---

### Task 14: Cron API route

**Files:**
- Create: `app/api/scan/route.ts`

**Interfaces:**
- Consumes: `runScan` (`lib/pipeline.ts`), `isNineEtHour`/`getEtParts` (`lib/time.ts`), `hasScanForDate` (`lib/supabase.ts`).
- Produces: `POST /api/scan` and `GET /api/scan` handlers. Always require `Authorization: Bearer {CRON_SECRET}`. ET-hour-9 guard plus per-ET-date dedup. Vercel cron issues GET, so both verbs share one handler. Marked `export const dynamic = "force-dynamic"`.

- [ ] **Step 1: Write `app/api/scan/route.ts`**

```ts
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
  if (await hasScanForDate(date)) {
    console.log(`[api/scan] skipped: scan already exists for ${date}`);
    return NextResponse.json({ skipped: "already scanned today" });
  }

  const result = await runScan({ isAutomatic: true, now });
  return NextResponse.json({ ok: true, kept: result.kept, scanRunId: result.scanRunId });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: route compiles. (The page is next.)

- [ ] **Step 3: Commit**

```bash
git add app/api/scan/route.ts
git commit -m "Add /api/scan cron route with bearer auth, ET-hour guard, and dedup"
```

---

### Task 15: Manual server action and page UI

**Files:**
- Create: `app/actions.ts`
- Create: `app/page.tsx`

**Interfaces:**
- Consumes: `runScan` (`lib/pipeline.ts`), `getLatestRun`/`ScanRecord` (`lib/supabase.ts`).
- Produces:
  - `runManualScan()` server action - calls `runScan({ isAutomatic: false })` directly (no ET-hour check, no dedup, always runs). Secret never reaches the client.
  - `app/page.tsx` server component - renders the latest run as a table and a manual-scan button wired to the server action.

- [ ] **Step 1: Write `app/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { runScan } from "@/lib/pipeline";

export async function runManualScan(): Promise<void> {
  // Manual path: always runs, no dedup, so it can be pressed repeatedly around
  // 16:00 Israel to watch the list develop. Runs server-side only.
  await runScan({ isAutomatic: false });
  revalidatePath("/");
}
```

- [ ] **Step 2: Write `app/page.tsx`**

```tsx
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
    loadError = err instanceof Error ? err.message : "Failed to load latest scan";
  }

  return (
    <main>
      <h1>Pre-Market Momentum Scanner</h1>
      <p>Manual scan is the primary trigger. Press to run now and refresh the table.</p>
      <form action={runManualScan}>
        <button type="submit">Run scan now</button>
      </form>

      {loadError ? (
        <p style={{ color: "crimson" }}>Could not load latest scan: {loadError}</p>
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
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: full build succeeds with no missing-page warning now that `app/page.tsx` exists.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts app/page.tsx
git commit -m "Add manual scan server action and latest-run results page"
```

---

### Task 16: Vercel cron config and README

**Files:**
- Create: `vercel.json`
- Create: `README.md`

**Interfaces:**
- Produces: dual UTC cron registration and end-to-end setup/run/verify docs.

- [ ] **Step 1: Write `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/scan", "schedule": "0 13 * * 1-5" },
    { "path": "/api/scan", "schedule": "0 14 * * 1-5" }
  ]
}
```

- [ ] **Step 2: Write `README.md`**

````markdown
# US Pre-Market Momentum Scanner

Finds US stocks up more than 90% in the pre-market session, classifies each as a
real catalyst / pump / dilution, stores the results in Supabase, and pushes a
Hebrew Telegram alert. Scan and alert only - no trade execution, no portfolio
tracking.

## Stack
- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres)
- Anthropic API (catalyst classification, model claude-haiku-4-5)
- Finnhub free tier (company news)
- Telegram Bot (alerts)
- Vercel hosting + cron (backup trigger)

## Triggers
- Manual button on the home page (primary). Calls the scan directly server-side.
- Vercel cron (backup): two UTC schedules (13:00 and 14:00 UTC, Mon-Fri) cover
  09:00 ET across DST. The handler proceeds only when the ET hour is exactly 9
  and no scan exists yet for today's ET date.

## Setup
1. `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in every value.
3. In the Supabase SQL editor, run `supabase/migrations/0001_premarket_scans.sql`.
4. Dev: `npm run dev` (uses `next dev --no-turbopack` for Windows).
5. Tests: `npm test`.

## Verifying the data source in isolation
- Weekend / market closed: `npm run scan:tv` (mechanical mode - drops the
  premarket filter so request, parsing, and column mapping can be checked).
- Trading day, US pre-market: `npm run scan:tv -- --premarket`.

## Environment variables
| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `FINNHUB_API_KEY` | Finnhub free-tier key (about 60 req/min) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Destination chat id (522356436) |
| `CRON_SECRET` | Required as `Authorization: Bearer` on every `/api/scan` call |
| `SEND_EMPTY_ALERTS` | `true`/`false`, default `true` - send a message when zero gappers |

## Cron auth on Vercel
Configure Vercel Cron to send `Authorization: Bearer ${CRON_SECRET}`. The route
rejects any request without it. For precise 09:00 ET timing (Hobby cron drifts
within the hour), use the manual button as the primary trigger or point an
external scheduler (for example cron-job.org) at `/api/scan` with the same
bearer header.

## Notes
- The TradingView endpoint is unofficial and undocumented; using it is against
  TradingView's Terms of Service and it can change without notice. All field
  names live in `lib/config.ts` (`TV_COLUMNS` / `TV_FILTERS`). If a request
  breaks, verify names against the `tradingview-screener` Python library field
  list and update that one file.
- Validate the full flow with the manual button on a weekday during US
  pre-market before relying on the cron.
````

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test`
Expected: all suites pass (`tradingview`, `tagging`, `format`, `time`, `classify`, `telegram`).
Run: `npm run build`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add vercel.json README.md
git commit -m "Add Vercel cron config and README with setup, env, and verification docs"
```

**>>> CHECKPOINT 3 ends here. Apply the migration in Supabase, fill `.env.local`, then validate end to end with the manual button during US pre-market on a weekday.**

---

## Self-Review

**Spec coverage:**
- Data source / TradingView endpoint, headers, response mapping, `s` split -> Tasks 3, 4, 5.
- Field names in one config constant -> Task 3 (`TV_COLUMNS`/`TV_FILTERS`).
- Filtering >90% + tags (market_cap_bucket, volume_thin, price_bucket) -> Tasks 6, 13.
- Catalyst classification (Finnhub 48h, Anthropic JSON-only, dilution/real/pump, no-news -> pump, defensive parse) -> Tasks 8, 9, 10.
- Storage with upsert and intraday history (`scan_run_id`, `(scan_run_id, ticker)`) -> Tasks 2, 12.
- Triggers: dual Vercel cron + ET-hour guard + dedup (automatic only); manual server action (always runs, no dedup) -> Tasks 14, 15, 16.
- Security: always-on bearer auth on `/api/scan`; secret server-side; service-role/Anthropic keys never client-side -> Tasks 12, 14, 15.
- Telegram: Hebrew, sorted desc, per-ticker block, dilution 🚩 / thin ⚠️, human numbers, empty-alert flag -> Tasks 7, 11.
- Env vars documented -> Tasks 1 (`.env.local.example`), 16 (README table).
- Logging at each stage -> Tasks 4, 9, 10, 11, 12, 13, 14.
- Rate limits: sequential classify with retry/backoff -> Tasks 10, 13.
- Checkpoint 2 runnable now (mechanical mode) -> Task 5.
- Regular hyphens only, `next dev --no-turbopack` -> Global Constraints, Task 1.

**Placeholder scan:** No TBDs; every code step contains complete code.

**Type consistency:** `ScanRow` (Task 4) consumed by Tasks 6/13; `Tags` (Task 6) used in Task 13; `Catalyst` (Task 10) used in Task 13; `AlertItem` (Task 11) produced by Task 13 and consumed by Task 11's `sendAlert`; `ScanRecord` (Task 12) produced by Task 13 and read by Task 15; `getEtParts`/`isNineEtHour`/`finnhubDateRange` (Task 8) used by Tasks 9/13/14. Conflict target string `"scan_run_id,ticker"` (Task 12) matches the migration's `unique (scan_run_id, ticker)` (Task 2).

**Ambiguity check:** `THIN_VOLUME_MAX` semantics fixed as "premarket volume at or below threshold" with the test asserting the boundary. `formatMarketCap` decimal rule made explicit and test-pinned.
