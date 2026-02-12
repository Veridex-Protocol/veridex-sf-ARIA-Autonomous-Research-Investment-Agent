/**
 * Web Search Provider
 *
 * Searches the web for real-time information using:
 * - DuckDuckGo Instant Answer API (free, no key)
 * - Wikipedia API for knowledge enrichment
 * - CryptoCompare news for crypto-specific queries
 *
 * Returns structured search results with summaries.
 */

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> { data: T; expiresAt: number; }
const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 120_000; // 2 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}
function setCache<T>(key: string, data: T): T {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

export interface WebSearchResult {
  query: string;
  summary: string;
  results: SearchResult[];
  relatedTopics: string[];
  news: Array<{ title: string; source: string; url: string; publishedAt: string }>;
  timestamp: number;
  live: boolean;
}

// ---------------------------------------------------------------------------
// DuckDuckGo Instant Answer
// ---------------------------------------------------------------------------

async function searchDDG(query: string): Promise<{ summary: string; results: SearchResult[]; relatedTopics: string[] }> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`DDG ${res.status}`);

    const data = await res.json() as any;

    const summary = data.AbstractText || data.Abstract || '';
    const results: SearchResult[] = [];
    const relatedTopics: string[] = [];

    // Abstract source
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        snippet: data.AbstractText.slice(0, 300),
        url: data.AbstractURL,
        source: data.AbstractSource || 'DuckDuckGo',
      });
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 8)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 80),
            snippet: topic.Text.slice(0, 200),
            url: topic.FirstURL,
            source: 'DuckDuckGo',
          });
          relatedTopics.push(topic.Text.split(' - ')[0] || topic.Text.slice(0, 50));
        }
        // Nested topics
        if (topic.Topics) {
          for (const sub of topic.Topics.slice(0, 3)) {
            if (sub.Text && sub.FirstURL) {
              results.push({
                title: sub.Text.split(' - ')[0] || sub.Text.slice(0, 80),
                snippet: sub.Text.slice(0, 200),
                url: sub.FirstURL,
                source: 'DuckDuckGo',
              });
            }
          }
        }
      }
    }

    // Infobox
    if (data.Infobox?.content) {
      for (const item of data.Infobox.content.slice(0, 5)) {
        if (item.label && item.value) {
          relatedTopics.push(`${item.label}: ${item.value}`);
        }
      }
    }

    return { summary, results: results.slice(0, 10), relatedTopics: relatedTopics.slice(0, 8) };
  } catch (err: any) {
    console.warn(`[web-search] DDG failed: ${err.message}`);
    return { summary: '', results: [], relatedTopics: [] };
  }
}

// ---------------------------------------------------------------------------
// Wikipedia search (for knowledge enrichment)
// ---------------------------------------------------------------------------

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
    const res = await fetchWithTimeout(url);

    if (res.ok) {
      const data = await res.json() as any;
      if (data.extract) {
        return [{
          title: data.title || query,
          snippet: data.extract.slice(0, 300),
          url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encoded}`,
          source: 'Wikipedia',
        }];
      }
    }

    // Fallback: search API
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&format=json&srlimit=3&origin=*`;
    const searchRes = await fetchWithTimeout(searchUrl);
    if (!searchRes.ok) return [];

    const searchData = await searchRes.json() as any;
    return (searchData.query?.search || []).map((item: any) => ({
      title: item.title,
      snippet: item.snippet.replace(/<[^>]*>/g, '').slice(0, 200),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
      source: 'Wikipedia',
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Crypto news (for crypto-related queries)
// ---------------------------------------------------------------------------

async function searchCryptoNews(query: string): Promise<Array<{ title: string; source: string; url: string; publishedAt: string }>> {
  try {
    // Extract token symbols from query
    const tokens = query.toUpperCase().match(/\b(BTC|ETH|SOL|AERO|ARB|OP|USDC|LINK|UNI|AAVE|BASE|DEFI|CRYPTO|BITCOIN|ETHEREUM|SOLANA)\b/g);
    if (!tokens || tokens.length === 0) return [];

    const categories = tokens.join(',');
    const url = `https://min-api.cryptocompare.com/data/v2/news/?categories=${categories}&sortOrder=latest&limit=5`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];

    const data = await res.json() as any;
    return (data.Data || []).map((article: any) => ({
      title: article.title,
      source: article.source_info?.name || article.source || 'unknown',
      url: article.url || '',
      publishedAt: new Date((article.published_on || 0) * 1000).toISOString(),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function webSearch(query: string): Promise<WebSearchResult> {
  const cacheKey = `search:${query.toLowerCase().trim()}`;
  const cached = getCached<WebSearchResult>(cacheKey);
  if (cached) return cached;

  // Run all searches in parallel
  const [ddg, wiki, news] = await Promise.all([
    searchDDG(query),
    searchWikipedia(query),
    searchCryptoNews(query),
  ]);

  // Merge results, dedup by URL
  const seenUrls = new Set<string>();
  const allResults: SearchResult[] = [];

  for (const r of [...ddg.results, ...wiki]) {
    if (!seenUrls.has(r.url)) {
      seenUrls.add(r.url);
      allResults.push(r);
    }
  }

  // Build summary
  let summary = ddg.summary;
  if (!summary && wiki.length > 0) {
    summary = wiki[0].snippet;
  }
  if (!summary && allResults.length > 0) {
    summary = allResults[0].snippet;
  }
  if (!summary) {
    summary = `No direct answer found for "${query}". See related results below.`;
  }

  const result: WebSearchResult = {
    query,
    summary,
    results: allResults.slice(0, 10),
    relatedTopics: ddg.relatedTopics,
    news,
    timestamp: Date.now(),
    live: allResults.length > 0 || news.length > 0,
  };

  return setCache(cacheKey, result);
}
