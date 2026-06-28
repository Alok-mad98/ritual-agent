import type { SearchResult, ScrapeResult } from '../types.js';

const FIRECRAWL_API_BASE = 'https://api.firecrawl.dev/v1';

export class FireCrawlClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async scrape(url: string, options?: {
    formats?: string[];
    onlyMainContent?: boolean;
    maxTokens?: number;
  }): Promise<ScrapeResult | null> {
    try {
      const body: Record<string, unknown> = {
        url,
        formats: options?.formats || ['markdown'],
        onlyMainContent: options?.onlyMainContent ?? true,
      };

      const resp = await fetch(`${FIRECRAWL_API_BASE}/scrape`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        console.error(`[FireCrawl] Scrape failed: ${resp.status}`);
        return null;
      }

      const data = await resp.json() as {
        success?: boolean;
        data?: {
          markdown?: string;
          html?: string;
          links?: string[];
          metadata?: { title?: string; url?: string };
        };
      };

      if (!data.success || !data.data) return null;

      return {
        url: data.data.metadata?.url || url,
        title: data.data.metadata?.title || '',
        content: data.data.markdown || data.data.html || '',
        markdown: data.data.markdown,
        links: data.data.links,
      };
    } catch (err) {
      console.error(`[FireCrawl] Scrape error: ${err}`);
      return null;
    }
  }

  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    try {
      const resp = await fetch(`${FIRECRAWL_API_BASE}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
          scrapeOptions: { formats: ['markdown'] },
        }),
      });

      if (!resp.ok) {
        console.error(`[FireCrawl] Search failed: ${resp.status}`);
        return [];
      }

      const data = await resp.json() as {
        success?: boolean;
        data?: Array<{
          markdown?: string;
          html?: string;
          metadata?: { title?: string; url?: string; description?: string };
        }>;
      };

      if (!data.success || !data.data) return [];

      return data.data.map((item) => ({
        title: item.metadata?.title || '',
        url: item.metadata?.url || '',
        snippet: item.metadata?.description || '',
        content: item.markdown?.slice(0, 5000),
      }));
    } catch (err) {
      console.error(`[FireCrawl] Search error: ${err}`);
      return [];
    }
  }

  async crawl(url: string, options?: {
    limit?: number;
    maxDepth?: number;
  }): Promise<ScrapeResult[]> {
    try {
      const resp = await fetch(`${FIRECRAWL_API_BASE}/crawl`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          limit: options?.limit || 20,
          maxDepth: options?.maxDepth || 2,
          scrapeOptions: { formats: ['markdown'] },
        }),
      });

      if (!resp.ok) {
        console.error(`[FireCrawl] Crawl failed: ${resp.status}`);
        return [];
      }

      const data = await resp.json() as {
        success?: boolean;
        data?: Array<{
          markdown?: string;
          metadata?: { title?: string; url?: string };
        }>;
      };

      if (!data.success || !data.data) return [];

      return data.data.map((item) => ({
        url: item.metadata?.url || '',
        title: item.metadata?.title || '',
        content: item.markdown || '',
        markdown: item.markdown,
      }));
    } catch (err) {
      console.error(`[FireCrawl] Crawl error: ${err}`);
      return [];
    }
  }
}
