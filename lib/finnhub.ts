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
