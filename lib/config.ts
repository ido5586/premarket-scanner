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
