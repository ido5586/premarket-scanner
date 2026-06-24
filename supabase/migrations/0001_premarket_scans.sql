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
