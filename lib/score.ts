import { MARKET_CAP_MICRO_MAX, MARKET_CAP_SMALL_MAX } from "./config";

// Inputs for the momentum score. floatShares is expressed in millions of
// shares (matching lib/float.ts), or null when unknown.
export type ScoreInput = {
  premarketPct: number | null;
  premarketVolume: number | null;
  marketCap: number | null;
  floatShares: number | null;
};

const PCT_BASELINE = 90; // all scanned tickers clear this floor
const PCT_CAP = 200; // % move that earns the full pct weight
const VOLUME_BASELINE = 1_000_000; // premarket volume that earns full volume weight

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// premarket_pct: 40% weight. Linear from 90% (0 pts) to 200% (40 pts), capped.
function pctScore(pct: number | null): number {
  if (pct == null) return 0;
  const ratio = (pct - PCT_BASELINE) / (PCT_CAP - PCT_BASELINE);
  return clamp(ratio * 40, 0, 40);
}

// premarket_volume: 30% weight. Linear from 0 to 1M (30 pts), capped at 30.
function volumeScore(volume: number | null): number {
  if (volume == null) return 0;
  return clamp((volume / VOLUME_BASELINE) * 30, 0, 30);
}

// market_cap: 20% weight, inverse — smaller cap scores higher.
function marketCapScore(marketCap: number | null): number {
  if (marketCap == null) return 0;
  if (marketCap < MARKET_CAP_MICRO_MAX) return 20; // micro
  if (marketCap <= MARKET_CAP_SMALL_MAX) return 10; // small
  return 0; // mid_plus and larger
}

// float: 10% weight, inverse — smaller float scores higher. Value in millions.
function floatScore(floatShares: number | null): number {
  if (floatShares == null) return 0;
  if (floatShares < 1) return 10;
  if (floatShares <= 5) return 7;
  if (floatShares <= 10) return 4;
  return 0;
}

export function calculateScore(row: ScoreInput): number {
  const total =
    pctScore(row.premarketPct) +
    volumeScore(row.premarketVolume) +
    marketCapScore(row.marketCap) +
    floatScore(row.floatShares);
  return Math.round(clamp(total, 0, 100));
}
