// Finviz exposes a free per-stock fundamentals page we can scrape for the
// "Shs Float" value. No API key is required. Everything here is defensive:
// any failure (network, missing field, unparseable value) yields null so the
// pipeline never breaks on float lookup.

const FINVIZ_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Parse Finviz magnitude strings ("1.23M", "456K", "2.1B") into a count of
// millions of shares. Returns null for "-" or anything unrecognized.
export function parseFloatValue(raw: string): number | null {
  const text = raw.trim();
  const match = /^([\d,.]+)\s*([KMB])?$/i.exec(text);
  if (!match) return null;
  const num = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(num)) return null;
  const unit = (match[2] ?? "").toUpperCase();
  switch (unit) {
    case "B":
      return num * 1000; // billions -> millions
    case "M":
      return num;
    case "K":
      return num / 1000; // thousands -> millions
    default:
      return num / 1_000_000; // bare share count -> millions
  }
}

// Extract the cell value immediately following the "Shs Float" label cell.
export function parseFloatFromHtml(html: string): number | null {
  const labelIdx = html.indexOf("Shs Float");
  if (labelIdx === -1) return null;
  // From the label, find the end of its <td>, then capture the next <td> body.
  const rest = html.slice(labelIdx);
  const match = /Shs Float[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(rest);
  if (!match) return null;
  // Strip any nested tags (e.g. <b>...</b>) from the captured cell.
  const cell = match[1].replace(/<[^>]*>/g, "").trim();
  if (!cell || cell === "-") return null;
  return parseFloatValue(cell);
}

export async function fetchFloat(ticker: string): Promise<number | null> {
  const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": FINVIZ_USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[float] ${ticker} Finviz request failed: ${res.status}`);
      return null;
    }
    const html = await res.text();
    return parseFloatFromHtml(html);
  } catch (err) {
    console.warn(`[float] ${ticker} Finviz request error:`, err);
    return null;
  }
}
