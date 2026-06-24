import { describe, expect, it, vi, afterEach } from "vitest";
import { dedupeHeadlines, fetchCompanyNews, type Headline } from "./news";

const now = new Date("2026-06-24T12:00:00Z");

describe("dedupeHeadlines", () => {
  it("collapses near-identical headlines into one", () => {
    const headlines: Headline[] = [
      { headline: "PLSM surges on partnership news", source: "finnhub", publishedAt: 1, summary: "" },
      { headline: "PLSM surges on partnership news!", source: "yahoo", publishedAt: 2, summary: "" },
      { headline: "Different story", source: "yahoo", publishedAt: 3, summary: "" },
    ];
    const result = dedupeHeadlines(headlines);
    expect(result).toHaveLength(2);
    expect(result.some((h) => h.headline.includes("Different story"))).toBe(true);
  });
});

describe("news fetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters out headlines older than 48h", async () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item><title>Old news</title><pubDate>Mon, 22 Jun 2026 11:00:00 GMT</pubDate></item>
        <item><title>Recent news</title><pubDate>Wed, 24 Jun 2026 10:00:00 GMT</pubDate></item>
      </channel></rss>`;

    vi.stubGlobal("fetch", vi.fn((url: string) =>
      Promise.resolve({ ok: true, text: () => Promise.resolve(xml) }),
    ));

    const headlines = await fetchCompanyNews("PLSM", now);
    expect(headlines.some((h) => h.headline === "Old news")).toBe(false);
    expect(headlines.some((h) => h.headline === "Recent news")).toBe(true);
  });

  it("continues when one source fails", async () => {
    vi.stubEnv("FINNHUB_API_KEY", "test-key");

    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item><title>Yahoo headline</title><pubDate>Wed, 24 Jun 2026 10:00:00 GMT</pubDate></item>
      </channel></rss>`;

    const fetchMock = vi.fn();
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("Finnhub down")));
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: true, text: () => Promise.resolve(xml) }));
    vi.stubGlobal("fetch", fetchMock);

    const headlines = await fetchCompanyNews("PLSM", now);
    expect(headlines).toHaveLength(1);
    expect(headlines[0].source).toBe("yahoo");
  });
});
