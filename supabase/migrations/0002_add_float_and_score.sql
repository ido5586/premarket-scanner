-- Add float share count and computed momentum score to premarket_scans.
-- float_shares is stored in millions of shares (e.g. 1.23 == 1.23M shares).
alter table premarket_scans
  add column if not exists float_shares   numeric,
  add column if not exists momentum_score integer;
