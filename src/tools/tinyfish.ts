import type { SearchResult, ScrapeResult } from '../types.js';

const TINYFISH_API_BASE = 'https://api.tinyfish.dev';

export class TinyFishClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, numResults: number = 10): Promise<SearchResult[]> {
    try {
      const resp = await fetch(`${TINYFISH_API_BASE}/search?q=${encodeURIComponent(query)}&num=${numResults}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error(`[TinyFish] Search failed: ${resp.status} ${text}`);
        return [];
      }

      const data = await resp.json() as { results?: SearchResult[] };
      return data.results || [];
    } catch (err) {
      console.error(`[TinyFish] Search error: ${err}`);
      return [];
    }
  }

  async fetch(url: string): Promise<ScrapeResult | null> {
    try {
      const resp = await fetch(`${TINYFISH_API_BASE}/fetch?url=${encodeURIComponent(url)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) {
        console.error(`[TinyFish] Fetch failed: ${resp.status}`);
        return null;
      }

      return await resp.json() as ScrapeResult;
    } catch (err) {
      console.error(`[TinyFish] Fetch error: ${err}`);
      return null;
    }
  }

  async searchAndFetch(query: string, numResults: number = 5): Promise<SearchResult[]> {
    const results = await this.search(query, numResults);
    const enriched = await Promise.all(
      results.slice(0, 3).map(async (r) => {
        const scraped = await this.fetch(r.url);
        if (scraped) {
          r.content = scraped.content?.slice(0, 5000);
        }
        return r;
      })
    );
    return enriched;
  }
}
