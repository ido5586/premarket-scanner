import { FINNHUB_API_BASE } from "./config";
import { finnhubDateRange } from "./time";

export type Headline = {
  headline: string;
  summary?: string;
  source: "finnhub" | "yahoo";
  publishedAt: number; // unix timestamp in seconds
};

const NEWS_WINDOW_SECONDS = 48 * 60 * 60;

function normalizeHeadline(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getWordSequences(text: string, size: number): string[] {
  const words = normalizeHeadline(text).split(" ").filter(Boolean);
  if (words.length < size) return [];
  return words.map((_, index) => words.slice(index, index + size).join(" ")).filter((seq) => seq.split(" ").length === size);
}

function areHeadlinesSimilar(a: string, b: string): boolean {
  const normA = normalizeHeadline(a);
  const normB = normalizeHeadline(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;
  const sequencesA = getWordSequences(normA, 5);
  const joinedB = ` ${normB} `;
  return sequencesA.some((sequence) => joinedB.includes(` ${sequence} `));
}

export function dedupeHeadlines(headlines: Headline[]): Headline[] {
  const unique: Headline[] = [];
  for (const candidate of headlines) {
    const duplicate = unique.some((existing) => areHeadlinesSimilar(existing.headline, candidate.headline));
    if (!duplicate) {
      unique.push(candidate);
    }
  }
  return unique;
}

async function fetchFinnhubNews(ticker: string, now: Date): Promise<Headline[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    console.warn("[news] FINNHUB_API_KEY not set; returning no Finnhub headlines");
    return [];
  }
  const { from, to } = finnhubDateRange(now);
  const url = `${FINNHUB_API_BASE}/company-news?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${token}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[news] ${ticker} Finnhub request failed: ${res.status}`);
      return [];
    }
    const json = await res.json();
    if (!Array.isArray(json)) return [];
    const headlines: Headline[] = json
      .map((item) => {
        const headline = typeof item?.headline === "string" ? item.headline : "";
        const summary = typeof item?.summary === "string" ? item.summary : undefined;
        const datetime = typeof item?.datetime === "number" ? item.datetime : 0;
        return {
          headline,
          summary,
          source: "finnhub" as const,
          publishedAt: datetime,
        };
      })
      .filter((h) => h.headline.length > 0 && h.publishedAt > 0);
    return headlines;
  } catch (err) {
    console.warn(`[news] ${ticker} Finnhub request error:`, err);
    return [];
  }
}

function parseYahooRss(xml: string, now: Date): Headline[] {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const headlines: Headline[] = [];
  const parser = typeof DOMParser !== "undefined" ? new DOMParser() : null;

  if (parser) {
    const doc = parser.parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return [];
    const items = Array.from(doc.querySelectorAll("item"));
    for (const item of items) {
      const title = item.querySelector("title")?.textContent?.trim() ?? "";
      const pubDateText = item.querySelector("pubDate")?.textContent?.trim() ?? "";
      const publishedAt = Math.floor(Date.parse(pubDateText) / 1000);
      if (!title || Number.isNaN(publishedAt)) continue;
      if (publishedAt < nowSeconds - NEWS_WINDOW_SECONDS || publishedAt > nowSeconds) continue;
      headlines.push({ headline: title, source: "yahoo" as const, publishedAt });
    }
    return headlines;
  }

  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const titleRegex = /<title>([\s\S]*?)<\/title>/i;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/i;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml))) {
    const itemText = match[1];
    const titleMatch = titleRegex.exec(itemText);
    const pubDateMatch = pubDateRegex.exec(itemText);
    if (!titleMatch || !pubDateMatch) continue;
    const title = titleMatch[1].trim();
    const publishedAt = Math.floor(Date.parse(pubDateMatch[1].trim()) / 1000);
    if (!title || Number.isNaN(publishedAt)) continue;
    if (publishedAt < nowSeconds - NEWS_WINDOW_SECONDS || publishedAt > nowSeconds) continue;
    headlines.push({ headline: title, source: "yahoo" as const, publishedAt });
  }
  return headlines;
}

async function fetchYahooNews(ticker: string, now: Date): Promise<Headline[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(
    ticker,
  )}&region=US&lang=en-US`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[news] ${ticker} Yahoo RSS request failed: ${res.status}`);
      return [];
    }
    const xml = await res.text();
    return parseYahooRss(xml, now);
  } catch (err) {
    console.warn(`[news] ${ticker} Yahoo RSS request error:`, err);
    return [];
  }
}

export async function fetchCompanyNews(ticker: string, now: Date = new Date()): Promise<Headline[]> {
  const [finnhubHeadlines, yahooHeadlines] = await Promise.all([
    fetchFinnhubNews(ticker, now).catch((err) => {
      console.warn(`[news] ${ticker} Finnhub fetch failed:`, err);
      return [] as Headline[];
    }),
    fetchYahooNews(ticker, now).catch((err) => {
      console.warn(`[news] ${ticker} Yahoo fetch failed:`, err);
      return [] as Headline[];
    }),
  ]);

  return dedupeHeadlines([...finnhubHeadlines, ...yahooHeadlines]);
}
