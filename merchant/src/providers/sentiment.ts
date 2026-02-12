/**
 * Real Sentiment Analysis Provider
 *
 * Aggregates sentiment signals from multiple free sources:
 * - CryptoCompare News API (free, no key for basic)
 * - Alternative.me Fear & Greed Index
 * - CoinGecko community/social data
 * - On-chain signals via public APIs
 *
 * Produces a composite sentiment score with source-level breakdowns.
 */

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> { data: T; expiresAt: number; }
const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 60_000; // 1 minute

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

export interface SentimentSignal {
  source: string;
  score: number; // -1 (bearish) to +1 (bullish)
  label: string;
  confidence: number;
  details: Record<string, unknown>;
}

export interface SentimentResult {
  token: string;
  sources: string[];
  overall: {
    score: number;
    label: string;
    confidence: number;
  };
  signals: SentimentSignal[];
  news: NewsItem[];
  fearGreedIndex: { value: number; label: string; timestamp: number } | null;
  recommendation: string;
  timestamp: number;
  live: boolean;
}

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  categories: string[];
}

// ---------------------------------------------------------------------------
// News from CryptoCompare
// ---------------------------------------------------------------------------

async function fetchNews(token: string): Promise<NewsItem[]> {
  try {
    const url = `https://min-api.cryptocompare.com/data/v2/news/?categories=${token.toUpperCase()}&sortOrder=latest&limit=10`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];

    const data = await res.json() as any;
    const articles = data.Data || [];

    return articles.map((a: any) => {
      // Simple keyword-based sentiment from title + body
      const text = `${a.title} ${a.body || ''}`.toLowerCase();
      const positiveWords = ['surge', 'rally', 'bullish', 'gain', 'rise', 'up', 'high', 'record', 'growth', 'adoption', 'partnership', 'launch', 'upgrade', 'breakout', 'momentum'];
      const negativeWords = ['crash', 'bearish', 'drop', 'fall', 'down', 'low', 'hack', 'exploit', 'sell', 'dump', 'fear', 'regulation', 'ban', 'lawsuit', 'decline', 'loss'];

      const posCount = positiveWords.filter(w => text.includes(w)).length;
      const negCount = negativeWords.filter(w => text.includes(w)).length;
      const sentiment: 'positive' | 'negative' | 'neutral' =
        posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'neutral';

      return {
        title: a.title,
        source: a.source_info?.name || a.source || 'unknown',
        url: a.url || a.guid || '',
        publishedAt: new Date((a.published_on || 0) * 1000).toISOString(),
        sentiment,
        categories: (a.categories || '').split('|').filter(Boolean),
      };
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Fear & Greed Index
// ---------------------------------------------------------------------------

async function fetchFearGreed(): Promise<{ value: number; label: string; timestamp: number } | null> {
  try {
    const res = await fetchWithTimeout('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return null;
    const data = await res.json() as any;
    const entry = data.data?.[0];
    if (!entry) return null;
    return {
      value: parseInt(entry.value, 10),
      label: entry.value_classification,
      timestamp: parseInt(entry.timestamp, 10) * 1000,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// On-chain signals (gas, whale activity approximation)
// ---------------------------------------------------------------------------

async function fetchOnChainSignals(token: string): Promise<SentimentSignal> {
  // Use CoinGecko's community data as a proxy for on-chain activity
  const geckoIds: Record<string, string> = {
    ETH: 'ethereum', BTC: 'bitcoin', SOL: 'solana', AERO: 'aerodrome-finance',
    ARB: 'arbitrum', OP: 'optimism', BASE: 'base-protocol',
  };
  const id = geckoIds[token.toUpperCase()] || token.toLowerCase();

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&developer_data=false&sparkline=false`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const coin = await res.json() as any;
    const community = coin.community_data || {};
    const md = coin.market_data || {};

    // Derive on-chain sentiment from volume trends and community engagement
    const volumeChange = md.total_volume?.usd && md.market_cap?.usd
      ? md.total_volume.usd / md.market_cap.usd
      : 0;

    // High volume/mcap ratio = more activity = slightly bullish signal
    const volumeSignal = Math.min(1, Math.max(-1, (volumeChange - 0.05) * 10));

    // Community engagement score
    const twitterFollowers = community.twitter_followers || 0;
    const redditSubscribers = community.reddit_subscribers || 0;
    const communityScore = Math.min(1, (twitterFollowers + redditSubscribers) / 1_000_000);

    const score = (volumeSignal * 0.6 + communityScore * 0.4);

    return {
      source: 'onchain',
      score: parseFloat(score.toFixed(3)),
      label: score > 0.2 ? 'accumulating' : score < -0.2 ? 'distributing' : 'neutral',
      confidence: 0.65,
      details: {
        volumeToMcapRatio: parseFloat(volumeChange.toFixed(4)),
        twitterFollowers,
        redditSubscribers,
        priceChange24h: md.price_change_percentage_24h,
        priceChange7d: md.price_change_percentage_7d,
      },
    };
  } catch {
    return {
      source: 'onchain',
      score: 0,
      label: 'unavailable',
      confidence: 0,
      details: {},
    };
  }
}

// ---------------------------------------------------------------------------
// Composite Sentiment
// ---------------------------------------------------------------------------

export async function fetchSentiment(token: string, requestedSources: string): Promise<SentimentResult> {
  const cacheKey = `sentiment:${token}:${requestedSources}`;
  const cached = getCached<SentimentResult>(cacheKey);
  if (cached) return cached;

  const sources = requestedSources === 'all'
    ? ['news', 'fear-greed', 'onchain']
    : [requestedSources];

  // Fetch all sources in parallel
  const [news, fearGreed, onChain] = await Promise.all([
    sources.includes('news') || sources.includes('all') ? fetchNews(token) : Promise.resolve([]),
    sources.includes('fear-greed') || sources.includes('all') ? fetchFearGreed() : Promise.resolve(null),
    sources.includes('onchain') || sources.includes('all') ? fetchOnChainSignals(token) : Promise.resolve(null),
  ]);

  // Build signals array
  const signals: SentimentSignal[] = [];

  // News sentiment signal
  if (news.length > 0) {
    const posCount = news.filter(n => n.sentiment === 'positive').length;
    const negCount = news.filter(n => n.sentiment === 'negative').length;
    const newsScore = news.length > 0 ? (posCount - negCount) / news.length : 0;
    signals.push({
      source: 'news',
      score: parseFloat(newsScore.toFixed(3)),
      label: newsScore > 0.2 ? 'bullish' : newsScore < -0.2 ? 'bearish' : 'neutral',
      confidence: Math.min(0.9, 0.5 + news.length * 0.04),
      details: {
        totalArticles: news.length,
        positive: posCount,
        negative: negCount,
        neutral: news.length - posCount - negCount,
        topHeadline: news[0]?.title || '',
      },
    });
  }

  // Fear & Greed signal
  if (fearGreed) {
    // Normalize 0-100 to -1 to +1
    const fgScore = (fearGreed.value - 50) / 50;
    signals.push({
      source: 'fear-greed-index',
      score: parseFloat(fgScore.toFixed(3)),
      label: fearGreed.label,
      confidence: 0.75,
      details: {
        rawValue: fearGreed.value,
        classification: fearGreed.label,
      },
    });
  }

  // On-chain signal
  if (onChain) {
    signals.push(onChain);
  }

  // Composite score (weighted average)
  const weights: Record<string, number> = { 'news': 0.35, 'fear-greed-index': 0.30, 'onchain': 0.35 };
  let totalWeight = 0;
  let weightedSum = 0;
  for (const sig of signals) {
    const w = weights[sig.source] || 0.33;
    weightedSum += sig.score * w * sig.confidence;
    totalWeight += w * sig.confidence;
  }
  const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const compositeConfidence = totalWeight > 0 ? totalWeight / signals.length : 0;

  const label = compositeScore > 0.25 ? 'bullish'
    : compositeScore < -0.25 ? 'bearish'
    : 'neutral';

  const recommendation = compositeScore > 0.3
    ? `${token} sentiment is bullish across ${signals.length} sources. Consider increasing position if fundamentals align.`
    : compositeScore < -0.3
    ? `${token} sentiment is bearish. Consider reducing exposure or waiting for reversal signals.`
    : `${token} sentiment is mixed/neutral. Hold current position and monitor for directional shift.`;

  const result: SentimentResult = {
    token,
    sources: signals.map(s => s.source),
    overall: {
      score: parseFloat(compositeScore.toFixed(3)),
      label,
      confidence: parseFloat(compositeConfidence.toFixed(3)),
    },
    signals,
    news: news.slice(0, 5), // Top 5 articles
    fearGreedIndex: fearGreed,
    recommendation,
    timestamp: Date.now(),
    live: signals.length > 0,
  };

  return setCache(cacheKey, result);
}
