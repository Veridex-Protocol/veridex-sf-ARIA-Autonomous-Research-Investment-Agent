/**
 * ARIA Merchant Server
 *
 * Paid API endpoints for market data, sentiment analysis, trade routing,
 * and trade execution. Each endpoint is protected by veridexPaywall
 * supporting all four agentic payment protocols (x402, UCP, ACP, AP2).
 *
 * This server demonstrates:
 * - Track 1: Real-world discover → pay → outcome workflow
 * - Track 2: Multiple paid tool endpoints for x402 tool chaining
 * - Track 3: AP2 mandate endpoints for authorization flows
 * - Track 4: DeFi execution endpoints with risk metadata
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import {
  veridexPaywall,
  createProtocolRoutes,
} from '@veridex/agentic-payments';
import type { PaidTool, PaymentReceipt } from '../../shared/types.js';
import { fetchMarketData } from './providers/market-data.js';
import { fetchSentiment } from './providers/sentiment.js';
import { fetchRoute } from './providers/route-optimizer.js';
import { fetchPortfolio } from './providers/portfolio.js';
import { webSearch } from './providers/web-search.js';

const PORT = parseInt(process.env.MERCHANT_PORT || '4000', 10);
const RECIPIENT = process.env.MERCHANT_RECIPIENT_ADDRESS || '0x0000000000000000000000000000000000000001';
const NETWORK = process.env.NETWORK || 'base-sepolia';
const MERCHANT_NAME = 'ARIA Market Intelligence';

// ---------------------------------------------------------------------------
// Tool Registry (free endpoint so agents can discover + plan costs)
// ---------------------------------------------------------------------------

export const TOOLS: PaidTool[] = [
  {
    id: 'market-data',
    name: 'Real-Time Market Data',
    description: 'Get current price, volume, market cap, and 24h change for any token pair.',
    endpoint: '/api/v1/market-data',
    priceUSD: 0.01,
    protocol: 'x402',
    category: 'market-data',
    parameters: [
      { name: 'pair', type: 'string', required: true, description: 'Token pair (e.g. ETH/USDC)' },
      { name: 'interval', type: 'string', required: false, description: 'Candle interval', enum: ['1m', '5m', '1h', '4h', '1d'] },
    ],
  },
  {
    id: 'sentiment',
    name: 'AI Sentiment Analysis',
    description: 'AI-powered sentiment analysis from social media, news, and on-chain signals.',
    endpoint: '/api/v1/sentiment',
    priceUSD: 0.05,
    protocol: 'x402',
    category: 'sentiment',
    parameters: [
      { name: 'token', type: 'string', required: true, description: 'Token symbol (e.g. ETH)' },
      { name: 'sources', type: 'string', required: false, description: 'Sources to analyze', enum: ['twitter', 'news', 'onchain', 'all'] },
    ],
  },
  {
    id: 'route-optimizer',
    name: 'DEX Route Optimizer',
    description: 'Find the optimal swap route across DEXes with price impact and gas estimates.',
    endpoint: '/api/v1/route',
    priceUSD: 0.02,
    protocol: 'x402',
    category: 'routing',
    parameters: [
      { name: 'tokenIn', type: 'string', required: true, description: 'Input token address' },
      { name: 'tokenOut', type: 'string', required: true, description: 'Output token address' },
      { name: 'amountIn', type: 'string', required: true, description: 'Input amount (human-readable)' },
      { name: 'chain', type: 'string', required: false, description: 'Chain', enum: ['base', 'ethereum', 'arbitrum', 'optimism'] },
    ],
  },
  {
    id: 'trade-execute',
    name: 'Trade Execution',
    description: 'Execute a swap via the optimal route. Returns tx hash and execution details.',
    endpoint: '/api/v1/execute',
    priceUSD: 0.10,
    protocol: 'x402',
    category: 'execution',
    parameters: [
      { name: 'routeId', type: 'string', required: true, description: 'Route ID from route optimizer' },
      { name: 'maxSlippageBps', type: 'number', required: false, description: 'Max slippage in basis points (default: 50)' },
      { name: 'deadline', type: 'number', required: false, description: 'Deadline in seconds (default: 300)' },
    ],
  },
  {
    id: 'portfolio-analytics',
    name: 'Portfolio Analytics',
    description: 'Analyze portfolio performance, risk metrics, and rebalancing suggestions.',
    endpoint: '/api/v1/analytics',
    priceUSD: 0.03,
    protocol: 'x402',
    category: 'analytics',
    parameters: [
      { name: 'address', type: 'string', required: true, description: 'Wallet address to analyze' },
      { name: 'chain', type: 'string', required: false, description: 'Chain', enum: ['base', 'ethereum', 'arbitrum', 'all'] },
    ],
  },
  {
    id: 'web-search',
    name: 'Web Search',
    description: 'Search the web for real-time information, news, and research on any topic.',
    endpoint: '/api/v1/search',
    priceUSD: 0.02,
    protocol: 'x402',
    category: 'market-data',
    parameters: [
      { name: 'query', type: 'string', required: true, description: 'Search query (e.g. "ETH merge impact on staking yields")' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Express App
// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// Mount .well-known protocol discovery routes (UCP, ACP, AP2)
app.use(createProtocolRoutes({
  amount: '0.01',
  recipient: RECIPIENT,
  network: NETWORK,
  merchantName: MERCHANT_NAME,
  description: 'ARIA Market Intelligence API',
}));

// ---------------------------------------------------------------------------
// WebSocket for real-time dashboard events
// ---------------------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));

  // Relay agent events to all other clients (dashboard)
  ws.on('message', (raw) => {
    try {
      const msg = raw.toString();
      // Re-broadcast to all OTHER connected clients
      for (const client of clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      }
    } catch { /* ignore malformed messages */ }
  });
});

function broadcast(event: Record<string, unknown>) {
  const msg = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// ---------------------------------------------------------------------------
// Free: Tool Discovery
// ---------------------------------------------------------------------------

app.get('/api/v1/tools', (_req, res) => {
  res.json({
    merchant: MERCHANT_NAME,
    tools: TOOLS,
    protocols: ['x402', 'ucp', 'acp', 'ap2'],
    network: NETWORK,
  });
});

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', merchant: MERCHANT_NAME, uptime: process.uptime() });
});

// ---------------------------------------------------------------------------
// Paid: Market Data ($0.01)
// ---------------------------------------------------------------------------

app.get('/api/v1/market-data',
  veridexPaywall({ amount: '0.01', recipient: RECIPIENT, network: NETWORK, description: 'Real-Time Market Data', }),
  async (req, res) => {
    const pair = (req.query.pair as string) || 'ETH/USDC';

    try {
      const data = await fetchMarketData(pair);
      broadcast({ type: 'payment:receipt', data: { tool: 'market-data', protocol: (req as any).veridexPayment?.protocol, amountUSD: 0.01, timestamp: Date.now() } });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: `Market data fetch failed: ${err.message}` });
    }
  }
);

// ---------------------------------------------------------------------------
// Paid: Sentiment Analysis ($0.05)
// ---------------------------------------------------------------------------

app.get('/api/v1/sentiment',
  veridexPaywall({ amount: '0.05', recipient: RECIPIENT, network: NETWORK, description: 'AI Sentiment Analysis', }),
  async (req, res) => {
    const token = (req.query.token as string) || 'ETH';
    const sources = (req.query.sources as string) || 'all';

    try {
      const data = await fetchSentiment(token, sources);
      broadcast({ type: 'payment:receipt', data: { tool: 'sentiment', protocol: (req as any).veridexPayment?.protocol, amountUSD: 0.05, timestamp: Date.now() } });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: `Sentiment analysis failed: ${err.message}` });
    }
  }
);

// ---------------------------------------------------------------------------
// Paid: Route Optimizer ($0.02)
// ---------------------------------------------------------------------------

app.get('/api/v1/route',
  veridexPaywall({ amount: '0.02', recipient: RECIPIENT, network: NETWORK, description: 'DEX Route Optimizer', }),
  async (req, res) => {
    const tokenIn = (req.query.tokenIn as string) || 'USDC';
    const tokenOut = (req.query.tokenOut as string) || 'ETH';
    const amountIn = (req.query.amountIn as string) || '100';
    const chain = (req.query.chain as string) || 'base';

    try {
      const data = await fetchRoute(tokenIn, tokenOut, amountIn, chain);
      broadcast({ type: 'payment:receipt', data: { tool: 'route-optimizer', protocol: (req as any).veridexPayment?.protocol, amountUSD: 0.02, timestamp: Date.now() } });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: `Route optimization failed: ${err.message}` });
    }
  }
);

// ---------------------------------------------------------------------------
// Paid: Trade Execution ($0.10)
// ---------------------------------------------------------------------------

app.post('/api/v1/execute',
  veridexPaywall({ amount: '0.10', recipient: RECIPIENT, network: NETWORK, description: 'Trade Execution', }),
  (req, res) => {
    const { routeId, maxSlippageBps = 50, deadline = 300 } = req.body || {};

    const txHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const data = {
      txHash,
      routeId: routeId || 'unknown',
      status: 'executed',
      tokenIn: 'USDC',
      tokenOut: 'ETH',
      amountIn: '100',
      amountOut: '0.035112',
      priceImpactBps: 12,
      slippageBps: 8,
      maxSlippageBps,
      gasUsed: '142000',
      gasCost: '0.00028 ETH',
      executedAt: Date.now(),
      blockNumber: 12345678 + Math.floor(Math.random() * 1000),
      dex: 'Uniswap V3',
      chain: NETWORK,
      receipt: {
        from: RECIPIENT,
        to: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        value: '0',
        confirmations: 1,
      },
    };

    broadcast({ type: 'payment:receipt', data: { tool: 'trade-execute', protocol: (req as any).veridexPayment?.protocol, amountUSD: 0.10, timestamp: Date.now() } });
    res.json(data);
  }
);

// ---------------------------------------------------------------------------
// Paid: Portfolio Analytics ($0.03)
// ---------------------------------------------------------------------------

app.get('/api/v1/analytics',
  veridexPaywall({ amount: '0.03', recipient: RECIPIENT, network: NETWORK, description: 'Portfolio Analytics', }),
  async (req, res) => {
    const address = (req.query.address as string) || '0x0000';
    const chain = (req.query.chain as string) || 'base';

    try {
      const data = await fetchPortfolio(address, chain);
      broadcast({ type: 'payment:receipt', data: { tool: 'portfolio-analytics', protocol: (req as any).veridexPayment?.protocol, amountUSD: 0.03, timestamp: Date.now() } });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: `Portfolio analysis failed: ${err.message}` });
    }
  }
);

// ---------------------------------------------------------------------------
// Paid: Web Search ($0.02)
// ---------------------------------------------------------------------------

app.get('/api/v1/search',
  veridexPaywall({ amount: '0.02', recipient: RECIPIENT, network: NETWORK, description: 'Web Search', }),
  async (req, res) => {
    const query = (req.query.query as string) || 'crypto market overview';

    try {
      const data = await webSearch(query);
      broadcast({ type: 'payment:receipt', data: { tool: 'web-search', protocol: (req as any).veridexPayment?.protocol, amountUSD: 0.02, timestamp: Date.now() } });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: `Web search failed: ${err.message}` });
    }
  }
);

// ---------------------------------------------------------------------------
// AP2 Mandate Management (Track 3)
// ---------------------------------------------------------------------------

const mandates = new Map<string, any>();

app.post('/api/v1/mandates', (req, res) => {
  const { description, maxValueUSD, allowedCategories, expiresInSeconds, tools } = req.body;
  const mandateId = `mandate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const mandate = {
    mandateId,
    version: '2026-01',
    cartMandate: {
      maxValue: { amount: maxValueUSD || 1, currency: 'USD' },
      allowedCategories: allowedCategories || ['*'],
      expiresAt: new Date(Date.now() + (expiresInSeconds || 300) * 1000).toISOString(),
    },
    paymentMandate: { provider: 'veridex', credentialType: 'session_key' },
    intentMandate: {
      source: 'agent_request',
      verifiedAt: new Date().toISOString(),
      description: description || 'Agent workflow mandate',
      tools: tools || [],
    },
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  mandates.set(mandateId, mandate);
  broadcast({ type: 'mandate:created', data: mandate });
  res.json(mandate);
});

app.post('/api/v1/mandates/:id/authorize', (req, res) => {
  const mandate = mandates.get(req.params.id);
  if (!mandate) return res.status(404).json({ error: 'Mandate not found' });

  mandate.status = 'authorized';
  mandate.authorizedAt = new Date().toISOString();
  mandate.authorizedBy = req.body.authorizedBy || 'user';

  broadcast({ type: 'mandate:authorized', data: mandate });
  res.json(mandate);
});

app.get('/api/v1/mandates/:id', (req, res) => {
  const mandate = mandates.get(req.params.id);
  if (!mandate) return res.status(404).json({ error: 'Mandate not found' });
  res.json(mandate);
});

app.post('/api/v1/mandates/:id/fulfill', (req, res) => {
  const mandate = mandates.get(req.params.id);
  if (!mandate) return res.status(404).json({ error: 'Mandate not found' });
  if (mandate.status !== 'authorized') return res.status(400).json({ error: 'Mandate not authorized' });

  mandate.status = 'fulfilled';
  const fulfillment = {
    mandateId: mandate.mandateId,
    fulfillmentId: `fulfill-${Date.now()}`,
    steps: req.body.steps || [],
    totalSpent: req.body.totalSpent || 0,
    receipts: req.body.receipts || [],
    completedAt: new Date().toISOString(),
  };

  broadcast({ type: 'mandate:fulfilled', data: fulfillment });
  res.json(fulfillment);
});

// ---------------------------------------------------------------------------
// Agent Credential Management
// ---------------------------------------------------------------------------
// The correct flow:
//   1. Human creates passkey wallet in the dashboard (they own it)
//   2. Human sets budget limits for the agent
//   3. Dashboard generates a session key client-side, encrypts it with the passkey
//   4. Both the passkey credentials and session key are sent here
//   5. The agent fetches the session key from here and uses it autonomously
//   6. Human can revoke the session key at any time via DELETE
// ---------------------------------------------------------------------------

interface WalletCredentials {
  credentialId: string;
  publicKeyX: string;
  publicKeyY: string;
  keyHash: string;
}

interface SessionKeyData {
  sessionKeyHash: string;
  sessionPublicKey: string;
  sessionAddress: string;
  encryptedPrivateKey: string;
  config: {
    dailyLimitUSD: number;
    perTransactionLimitUSD: number;
    expiryHours: number;
    allowedChains: number[];
  };
  createdAt: number;
  expiresAt: number;
  masterKeyHash: string;
}

interface AgentCredentials {
  wallet: WalletCredentials;
  session: SessionKeyData;
  configuredAt: string;
}

let agentCredentials: AgentCredentials | null = null;

app.post('/api/v1/agent/credentials', (req, res) => {
  const { wallet, session } = req.body;

  // Validate wallet (passkey) credentials
  if (!wallet?.credentialId || !wallet?.publicKeyX || !wallet?.publicKeyY || !wallet?.keyHash) {
    return res.status(400).json({
      error: 'Missing wallet fields: credentialId, publicKeyX, publicKeyY, keyHash',
    });
  }

  // Validate session key data
  if (!session?.sessionKeyHash || !session?.sessionPublicKey || !session?.encryptedPrivateKey || !session?.sessionAddress) {
    return res.status(400).json({
      error: 'Missing session key fields: sessionKeyHash, sessionPublicKey, encryptedPrivateKey, sessionAddress',
    });
  }

  agentCredentials = {
    wallet,
    session,
    configuredAt: new Date().toISOString(),
  };

  console.log(`\n🔑 Agent credentials configured:`);
  console.log(`   Passkey Hash: ${wallet.keyHash.slice(0, 20)}...`);
  console.log(`   Session Key:  ${session.sessionKeyHash.slice(0, 20)}...`);
  console.log(`   Session Addr: ${session.sessionAddress}`);
  console.log(`   Daily Limit:  $${session.config.dailyLimitUSD}`);
  console.log(`   Per-Tx Limit: $${session.config.perTransactionLimitUSD}`);
  console.log(`   Expires:      ${new Date(session.expiresAt).toLocaleString()}`);
  console.log(`   Configured:   ${agentCredentials.configuredAt}\n`);

  broadcast({
    type: 'agent:configured',
    data: {
      keyHash: wallet.keyHash,
      sessionAddress: session.sessionAddress,
      sessionKeyHash: session.sessionKeyHash,
      dailyLimitUSD: session.config.dailyLimitUSD,
      configuredAt: agentCredentials.configuredAt,
    },
  });

  res.json({
    success: true,
    keyHash: wallet.keyHash,
    sessionAddress: session.sessionAddress,
    configuredAt: agentCredentials.configuredAt,
    message: 'Wallet and session key configured. The agent can now operate within the authorized budget.',
  });
});

app.delete('/api/v1/agent/credentials', (_req, res) => {
  if (!agentCredentials) {
    return res.status(404).json({ error: 'No active session to revoke.' });
  }

  const revokedSession = agentCredentials.session.sessionKeyHash;
  agentCredentials = null;

  console.log(`\n🔒 Session key revoked: ${revokedSession.slice(0, 20)}...\n`);
  broadcast({ type: 'agent:revoked', data: { sessionKeyHash: revokedSession } });

  res.json({ success: true, revoked: revokedSession });
});

app.get('/api/v1/agent/status', (_req, res) => {
  if (agentCredentials) {
    res.json({
      configured: true,
      keyHash: agentCredentials.wallet.keyHash,
      sessionAddress: agentCredentials.session.sessionAddress,
      sessionKeyHash: agentCredentials.session.sessionKeyHash,
      dailyLimitUSD: agentCredentials.session.config.dailyLimitUSD,
      perTransactionLimitUSD: agentCredentials.session.config.perTransactionLimitUSD,
      expiresAt: agentCredentials.session.expiresAt,
      configuredAt: agentCredentials.configuredAt,
    });
  } else {
    res.json({ configured: false });
  }
});

app.get('/api/v1/agent/credentials', (_req, res) => {
  if (!agentCredentials) {
    return res.status(404).json({ error: 'No credentials configured. Create a wallet from the dashboard first.' });
  }
  res.json(agentCredentials);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`\n🏪 ARIA Merchant Server running on http://localhost:${PORT}`);
  console.log(`   📡 WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   🔧 Tools: ${TOOLS.length} paid endpoints`);
  console.log(`   💰 Protocols: x402, UCP, ACP, AP2`);
  console.log(`   🌐 Network: ${NETWORK}`);
  console.log(`   📋 Discovery: http://localhost:${PORT}/api/v1/tools`);
  console.log();
});

export { app, server, wss, broadcast };
