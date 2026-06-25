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

// Share float, stored in millions of shares. e.g. 1.2 -> "1.2M", 0.456 -> "456K".
export function formatFloat(millions: number | null): string {
  if (millions == null) return "?";
  if (millions >= 1000) return `${(millions / 1000).toFixed(1)}B`;
  if (millions >= 1) return `${millions.toFixed(1)}M`;
  return `${Math.round(millions * 1000)}K`;
}
