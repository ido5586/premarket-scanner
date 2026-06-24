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
