import { fetchCompanyNews as fetchUnifiedCompanyNews, type Headline } from "./news";

export type { Headline };

export async function fetchCompanyNews(
  ticker: string,
  now: Date = new Date(),
): Promise<Headline[]> {
  return fetchUnifiedCompanyNews(ticker, now);
}
