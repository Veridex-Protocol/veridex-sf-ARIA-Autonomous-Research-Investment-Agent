/**
 * Real Market Data Provider
 *
 * Fetches live price, volume, market cap, and historical data from:
 * - CoinGecko (free, no API key required — 30 req/min)
 * - Fallback: CryptoCompare
 *
 * All data is cached for 30 seconds to stay within rate limits.
 */

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 30_000; // 30 seconds

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

// ---------------------------------------------------------------------------
// CoinGecko ID mapping
// ---------------------------------------------------------------------------

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDC: 'usd-coin',
  USDT: 'tether',
  SOL: 'solana',
  AERO: 'aerodrome-finance',
  WETH: 'weth',
  CBETH: 'coinbase-wrapped-staked-eth',
  ARB: 'arbitrum',
  OP: 'optimism',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  MKR: 'maker',
  CRV: 'curve-dao-token',
  LDO: 'lido-dao',
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  RENDER: 'render-token',
  FET: 'artificial-superintelligence-alliance',
  INJ: 'injective-protocol',
  SUI: 'sui',
  APT: 'aptos',
  SEI: 'sei-network',
  TIA: 'celestia',
  NEAR: 'near',
  ATOM: 'cosmos',
  DOT: 'polkadot',
  ADA: 'cardano',
  XRP: 'ripple',
  BNB: 'binancecoin',
  BASE: 'base-protocol',
  MON: 'monad',
  STX: 'blockstack',
};

function resolveGeckoId(symbol: string): string {
  return COINGECKO_IDS[symbol.toUpperCase()] || symbol.toLowerCase();
}

// ---------------------------------------------------------------------------
// Fetcher with timeout + retry
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MarketDataResult {
  pair: string;
  price: number;
  volume24h: number;
  marketCap: number;
  change24h: string;
  change7d: string;
  high24h: number;
  low24h: number;
  ath: number;
  athDate: string;
  circulatingSupply: number;
  totalSupply: number | null;
  sparkline7d: number[];
  timestamp: number;
  source: string;
  live: boolean;
}

export async function fetchMarketData(pair: string): Promise<MarketDataResult> {
  const [baseSymbol, quoteSymbol] = pair.split('/');
  const cacheKey = `market:${pair}`;
  const cached = getCached<MarketDataResult>(cacheKey);
  if (cached) return cached;

  const geckoId = resolveGeckoId(baseSymbol);
  const vsCurrency = (quoteSymbol || 'USD').toLowerCase() === 'usdc' ? 'usd' : (quoteSymbol || 'usd').toLowerCase();

  try {
    // CoinGecko /coins/{id} — rich data, free
    const url = `https://api.coingecko.com/api/v3/coins/${geckoId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=true`;
    const res = await fetchWithTimeout(url);

    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const coin = await res.json() as any;
    const md = coin.market_data;

    const result: MarketDataResult = {
      pair,
      price: md.current_price?.[vsCurrency] ?? md.current_price?.usd ?? 0,
      volume24h: md.total_volume?.[vsCurrency] ?? md.total_volume?.usd ?? 0,
      marketCap: md.market_cap?.[vsCurrency] ?? md.market_cap?.usd ?? 0,
      change24h: `${(md.price_change_percentage_24h ?? 0).toFixed(2)}%`,
      change7d: `${(md.price_change_percentage_7d ?? 0).toFixed(2)}%`,
      high24h: md.high_24h?.[vsCurrency] ?? md.high_24h?.usd ?? 0,
      low24h: md.low_24h?.[vsCurrency] ?? md.low_24h?.usd ?? 0,
      ath: md.ath?.[vsCurrency] ?? md.ath?.usd ?? 0,
      athDate: md.ath_date?.[vsCurrency] ?? md.ath_date?.usd ?? '',
      circulatingSupply: md.circulating_supply ?? 0,
      totalSupply: md.total_supply ?? null,
      sparkline7d: coin.market_data?.sparkline_7d?.price?.slice(-24) ?? [],
      timestamp: Date.now(),
      source: 'coingecko',
      live: true,
    };

    return setCache(cacheKey, result);
  } catch (err: any) {
    console.warn(`[market-data] CoinGecko failed for ${pair}: ${err.message}, trying CryptoCompare...`);
    return fetchMarketDataFallback(pair, baseSymbol, quoteSymbol || 'USD');
  }
}

async function fetchMarketDataFallback(pair: string, base: string, quote: string): Promise<MarketDataResult> {
  try {
    const url = `https://min-api.cryptocompare.com/data/pricemultifull?fsyms=${base.toUpperCase()}&tsyms=${quote.toUpperCase()}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`CryptoCompare ${res.status}`);

    const data = await res.json() as any;
    const raw = data.RAW?.[base.toUpperCase()]?.[quote.toUpperCase()];

    if (!raw) throw new Error('No data from CryptoCompare');

    const result: MarketDataResult = {
      pair,
      price: raw.PRICE ?? 0,
      volume24h: raw.TOTALVOLUME24HTO ?? 0,
      marketCap: raw.MKTCAP ?? 0,
      change24h: `${(raw.CHANGEPCT24HOUR ?? 0).toFixed(2)}%`,
      change7d: 'N/A',
      high24h: raw.HIGH24HOUR ?? 0,
      low24h: raw.LOW24HOUR ?? 0,
      ath: 0,
      athDate: '',
      circulatingSupply: raw.CIRCULATINGSUPPLY ?? 0,
      totalSupply: raw.SUPPLY ?? null,
      sparkline7d: [],
      timestamp: Date.now(),
      source: 'cryptocompare',
      live: true,
    };

    return setCache(`market:${pair}`, result);
  } catch (err: any) {
    console.warn(`[market-data] CryptoCompare also failed: ${err.message}`);
    // Return a clearly-labeled error result rather than fake data
    return {
      pair,
      price: 0,
      volume24h: 0,
      marketCap: 0,
      change24h: 'N/A',
      change7d: 'N/A',
      high24h: 0,
      low24h: 0,
      ath: 0,
      athDate: '',
      circulatingSupply: 0,
      totalSupply: null,
      sparkline7d: [],
      timestamp: Date.now(),
      source: 'unavailable',
      live: false,
    };
  }
}
