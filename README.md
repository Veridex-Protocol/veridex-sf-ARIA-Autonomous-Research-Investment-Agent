# ARIA — Autonomous Research & Investment Agent

> **SF Agentic Commerce x402 Hackathon 2026**  
> A single enterprise-grade project targeting **all 5 tracks**.

ARIA is an autonomous AI agent that researches markets, reasons about costs, gets user authorization via AP2 mandates, executes DeFi trades via x402 payments, and produces full audit trails — paying for every tool call along the way.

**The human stays in control.** You create a passkey wallet, set a spending budget, and authorize a session key. The agent operates autonomously within those limits. You can revoke access at any time.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  ARIA Dashboard (Next.js 15)                 │
│                                                             │
│  /setup — Wallet creation + budget config + session key     │
│  /       — Real-time monitor (payments, mandates, risk)     │
│                                                             │
│  UI: Tailwind v4 · shadcn/ui components · Lucide icons      │
│  WebSocket ← Merchant WS for live updates                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                   ARIA Agent (Node.js + LLM)                │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Discovery │→│ Planning  │→│ Authorize │→│  Execute    │  │
│  │ (free)   │  │ (LLM)    │  │ (AP2)    │  │ (x402 pay) │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │ Decide   │→│ Trade     │→│ Report    │                  │
│  │ (LLM)    │  │ (x402)   │  │ (audit)  │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                                             │
│  Uses human-authorized SESSION KEY (not the passkey)        │
│  Risk Engine: spend caps, slippage bounds, allowlists       │
│  Audit Logger: structured receipts, reason codes, tx hashes │
└──────────────────────────┬──────────────────────────────────┘
                           │ x402 / UCP / ACP / AP2
┌──────────────────────────┴──────────────────────────────────┐
│              Merchant Server (Express + veridexPaywall)      │
│                                                             │
│  Paid APIs:                    Protocol Discovery:          │
│  /api/v1/market-data  $0.01    /.well-known/ucp             │
│  /api/v1/sentiment    $0.05    /.well-known/acp-checkout    │
│  /api/v1/route        $0.02    /.well-known/ap2-mandate     │
│  /api/v1/execute      $0.10                                 │
│  /api/v1/analytics    $0.03    AP2 Mandates:                │
│                                POST /api/v1/mandates        │
│  Free:                         POST /mandates/:id/authorize │
│  /api/v1/tools (discovery)     POST /mandates/:id/fulfill   │
│  /api/v1/health                                             │
│                                                             │
│  Agent Credentials:            Session Revocation:          │
│  POST /api/v1/agent/credentials  DELETE /api/v1/agent/creds │
│  GET  /api/v1/agent/status                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Track Coverage

| Track | Requirement | How ARIA Delivers |
|-------|------------|-------------------|
| **1. Best Agentic App** | Discover → decide → pay → outcome | 7-phase workflow: discover tools → plan with LLM → authorize via AP2 → pay via x402 → analyze → trade → report |
| **2. x402 Tool Usage** | CDP Wallets + x402 + tool chaining + cost reasoning | 5 paid tool calls chained in one workflow, LLM reasons about cost/value tradeoffs, budget-aware pruning |
| **3. Best AP2 Integration** | Intent → authorization → settlement → receipt | Clean AP2 mandate lifecycle: create → authorize → execute within mandate → fulfill with receipts |
| **4. DeFi/Trading Agent** | DeFi actions + risk controls + reasoning | Multi-source research → LLM analysis → constrained trade execution with spend caps, slippage bounds, allowlists |
| **5. Encrypted Agents** | BITE v2 conditional transactions | Trading strategy encrypted until execution (prevents front-running) — SKALE integration |

---

## Quickstart

### Prerequisites

- Node.js 20+
- npm or bun
- A browser that supports WebAuthn / Passkeys (Chrome, Safari, Edge)
- (Optional) Gemini API key for LLM reasoning (free at https://aistudio.google.com/apikey)

### 1. Install

```bash
cd hackathon/sf-agentic-commerce-x402

# Root project (merchant + agent)
bun install        # or: npm install

# Dashboard
cd dashboard && bun install && cd ..   # or: npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — only GEMINI_API_KEY is optional, wallet credentials come from the UI
```

### 3. Run

```bash
# Terminal 1: Start merchant server
npm run dev:merchant

# Terminal 2: Start dashboard
npm run dev:dashboard

# Terminal 3: Run the agent (will wait for wallet + session key)
npm run dev:agent
```

Or run everything at once:

```bash
npm run dev
```

### 4. Create a Wallet & Authorize the Agent

1. Open **http://localhost:3000/setup** in your browser
2. **Step 1 — Create Passkey**: Click "Create Passkey" — your browser prompts for biometric / PIN
3. **Step 2 — Set Budget**: Configure the agent's spending limits:
   - **Daily limit** (default: $50)
   - **Per-transaction limit** (default: $5)
   - **Session duration** (default: 24 hours, max 24h)
4. **Step 3 — Authorize**: Click "Authorize Agent" — a secp256k1 session key is generated client-side, encrypted with your passkey, and sent to the agent backend
5. The agent picks up the session key and begins the workflow

> **You stay in control.**
> - Your passkey wallet is created via WebAuthn and stored in your OS keychain
> - No private keys leave your device unencrypted
> - The agent only receives a budget-constrained session key
> - You can **revoke** the session key at any time from the dashboard

### 5. Watch

- **Wallet Setup**: http://localhost:3000/setup — create wallet, set budget, revoke sessions
- **Dashboard**: http://localhost:3000 — real-time agent activity (Live Feed, Payments, Mandates, Risk tabs)
- **Merchant**: http://localhost:4000/api/v1/tools — tool discovery
- **Agent**: Terminal output with full audit trail

### Custom Objective

```bash
# Pass a custom objective and budget
npx tsx agent/src/index.ts "Research SOL market and find arbitrage opportunities" 2.0
```

---

## Wallet & Session Key Flow

The security model separates **ownership** (passkey) from **operation** (session key):

```
┌──────────────────────────────────────────────────────────────┐
│                  Dashboard /setup (Browser)                   │
│                                                              │
│  Step 1: Create Passkey Wallet                               │
│    WebAuthn → PasskeyManager.register()                      │
│    → { credentialId, publicKeyX, publicKeyY, keyHash }       │
│                                                              │
│  Step 2: Configure Budget                                    │
│    Human sets: dailyLimitUSD, perTxLimitUSD, expiryHours     │
│                                                              │
│  Step 3: Generate Session Key (client-side)                  │
│    generateSecp256k1KeyPair() → session key pair             │
│    deriveEncryptionKey(credentialId) → AES key               │
│    encrypt(privateKey, AES key) → encrypted blob             │
│    → { sessionKeyHash, sessionAddress, encryptedPrivateKey } │
│                                                              │
│  Step 4: Send to Agent                                       │
│    POST /api/wallet → POST /api/v1/agent/credentials         │
│    Body: { wallet: {...}, session: {...} }                    │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────┐
│               Merchant Server (stores in memory)             │
│                                                              │
│  Stores both wallet credentials AND session key data         │
│  GET  /api/v1/agent/credentials → returns { wallet, session }│
│  GET  /api/v1/agent/status → session details + limits        │
│  DELETE /api/v1/agent/credentials → revoke session key       │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────────┐
│                    Agent (tool-executor.ts)                   │
│                                                              │
│  resolveCredentials() polls merchant until creds available    │
│  → createAgentWallet({                                       │
│      masterCredential: wallet,                               │
│      session: { limits from human-authorized config }        │
│    })                                                        │
│  → AgentWallet.fetch() uses session key for x402 payments    │
│  → Budget enforced by human-set limits, not agent defaults   │
└──────────────────────────────────────────────────────────────┘
```

### Key Security Properties

| Property | Implementation |
|----------|---------------|
| **Human owns the wallet** | Passkey created via WebAuthn, stored in OS keychain |
| **Agent gets a session key** | secp256k1 key pair, encrypted with passkey credential |
| **Budget is human-set** | Daily limit, per-tx limit, and expiry configured in the UI |
| **Revocable** | Human can revoke the session key at any time via dashboard |
| **No unencrypted keys leave the device** | Private key encrypted with AES-GCM derived from credential ID |
| **Time-bounded** | Session key expires after the configured duration (max 24h) |

The agent's `resolveCredentials()` function checks two sources:
1. **Environment variables** — for CI / pre-configured deployments (`VERIDEX_CREDENTIAL_ID` + `VERIDEX_SESSION_KEY`)
2. **Merchant server** — populated by the dashboard after wallet creation + session key authorization

If neither source has credentials, the agent prints a message and polls every 2s
for up to 60s, giving the user time to create a wallet from the dashboard.

---

## Demo Workflow

When you run the agent, it executes this 7-phase workflow:

### Phase 1: Discovery (Free)
Agent calls `/api/v1/tools` to discover 5 paid endpoints with prices.

### Phase 2: Planning (LLM)
LLM analyzes the objective, available tools, and budget to create an optimal plan:
```
Plan: 4 steps, estimated cost: $0.11
1. market-data ($0.01) — Get current ETH price and 24h trend
2. sentiment ($0.05) — Analyze market sentiment across all sources
3. portfolio-analytics ($0.03) — Check current portfolio allocation
4. route-optimizer ($0.02) — Find optimal swap route
```

### Phase 3: Authorization (AP2)
Creates an AP2 mandate with budget cap and tool allowlist:
```json
{
  "mandateId": "mandate-1707...",
  "cartMandate": { "maxValue": { "amount": 0.165, "currency": "USD" } },
  "allowedCategories": ["market-data", "sentiment", "routing", "execution"],
  "status": "authorized"
}
```

### Phase 4: Execution (x402 Payments)
Each tool call follows the x402 flow:
1. `GET /api/v1/market-data?pair=ETH/USDC` → **402 Payment Required**
2. Parse `PAYMENT-REQUIRED` header (base64 JSON)
3. Build `PAYMENT-SIGNATURE` with session key
4. Retry → **200 OK** with data

Risk engine assesses each call before payment:
```
✅ tool:market-data | $0.0100 | low risk | Auto-approved
✅ tool:sentiment   | $0.0500 | low risk | Auto-approved
✅ tool:analytics   | $0.0300 | low risk | Auto-approved
✅ tool:route       | $0.0200 | low risk | Auto-approved
```

### Phase 5: Decision (LLM)
LLM analyzes all research results and decides:
```json
{
  "decision": "buy",
  "confidence": 0.72,
  "reasoning": "ETH shows positive momentum, bullish sentiment, portfolio under-allocated...",
  "action": { "tool": "trade-execute", "params": { "routeId": "latest", "maxSlippageBps": 50 } }
}
```

### Phase 6: Trade Execution (x402)
Executes the trade via the paid execution endpoint ($0.10):
```
Trade executed: 0x7a3f...
USDC → ETH via Uniswap V3 | Amount: $50 | Slippage: 8bps
```

### Phase 7: Report & Audit Trail
```
═══════════════════════════════════════════
FINAL REPORT
═══════════════════════════════════════════
Status: completed
Steps: 9
Total Cost: $0.2100
Budget Remaining: $0.7900

Payment Receipts:
  X402 | market-data        | $0.0100 | settled
  X402 | sentiment          | $0.0500 | settled
  X402 | portfolio-analytics | $0.0300 | settled
  X402 | route-optimizer    | $0.0200 | settled
  X402 | trade-execute      | $0.1000 | settled

Risk Assessments: 5/5 approved
AP2 Mandate: fulfilled (spent $0.21 of $0.165 budget)
```

---

## Project Structure

```
sf-agentic-commerce-x402/
├── merchant/src/
│   └── server.ts              # Express server with veridexPaywall, credential + session storage
├── agent/src/
│   ├── aria-agent.ts          # LLM-powered autonomous agent orchestrator
│   ├── tool-executor.ts       # AgentWallet.fetch() with session key from human-authorized config
│   ├── risk-engine.ts         # Spend caps, slippage bounds, allowlists
│   ├── audit-logger.ts        # Structured receipts, reason codes, tx hashes
│   └── index.ts               # CLI entry point
├── dashboard/
│   ├── app/
│   │   ├── layout.tsx         # Next.js layout with sticky nav (Inter + JetBrains Mono)
│   │   ├── page.tsx           # Real-time monitor — tabs: Live Feed, Payments, Mandates, Risk
│   │   ├── setup/page.tsx     # Multi-step: Create Wallet → Set Budget → Authorize Agent
│   │   ├── globals.css        # Tailwind v4 @theme tokens, animations, dark mode
│   │   └── api/wallet/
│   │       └── route.ts       # POST (wallet+session), GET (status), DELETE (revoke)
│   ├── components/ui/         # shadcn/ui-style components (Card, Badge, Button, Tabs, etc.)
│   └── lib/
│       ├── passkey.ts         # WebAuthn + session key generation (client-side crypto)
│       └── utils.ts           # cn() utility (clsx + tailwind-merge)
├── shared/
│   └── types.ts               # Shared TypeScript types
├── .env.example
├── package.json
└── README.md
```

---

## Key Technical Decisions

### Why Veridex Agent SDK?

The `@veridex/agentic-payments` SDK provides:
- **Universal Protocol Abstraction**: Single `agent.fetch()` auto-detects x402, UCP, ACP, AP2
- **Server Middleware**: `veridexPaywall()` protects endpoints with all 4 protocols in 2 lines
- **Protocol Discovery**: `.well-known` routes for UCP manifest, ACP checkout, AP2 mandate
- **Session Keys**: Budget-constrained, revocable spending keys derived from passkeys
- **Multi-Chain**: Base, Ethereum, Arbitrum, Optimism, Stacks

### Human-Controlled Session Keys

Unlike typical agent wallets where the agent controls its own keys, ARIA uses a **human-in-the-loop** model:

1. **Human creates** a passkey wallet (P-256 via WebAuthn) — they own it
2. **Human configures** the budget (daily limit, per-tx limit, session duration)
3. **Dashboard generates** a secp256k1 session key client-side
4. **Private key is encrypted** with AES-GCM derived from the passkey credential ID
5. **Only the encrypted session key** is sent to the agent
6. **Human can revoke** the session key at any time from the dashboard

This ensures the agent can never spend more than the human authorized, and the human can cut off access instantly.

### Risk Controls (Track 4)

| Control | Implementation |
|---------|---------------|
| **Spend cap** | Human-configured daily limit (default $50) and per-tx limit (default $5) |
| **Auto-approve** | Only under $1 — above requires explicit approval |
| **Slippage** | Max 100bps enforced before trade execution |
| **Allowlist** | Only approved tokens (USDC, ETH, WETH, AERO, cbETH) |
| **Chain allowlist** | Only approved chains (Base, Ethereum, Arbitrum) |
| **Cooldown** | 1s minimum between actions |
| **Time-bounded** | Session key expires after human-configured duration (max 24h) |
| **Revocable** | Human can revoke session key at any time via dashboard |
| **Audit trail** | Every action logged with reason codes |

### AP2 Mandate Flow (Track 3)

```
Agent                    Merchant                 User
  │                         │                       │
  ├─ POST /mandates ───────►│                       │
  │  {maxValue, categories} │                       │
  │◄── mandate (pending) ───┤                       │
  │                         │                       │
  ├─ POST /mandates/:id/authorize ─────────────────►│
  │◄── mandate (authorized) ┤                       │
  │                         │                       │
  ├─ Execute tools within mandate budget ──────────►│
  │  (x402 payments, risk-assessed)                 │
  │                         │                       │
  ├─ POST /mandates/:id/fulfill ───────────────────►│
  │  {steps, receipts, totalSpent}                  │
  │◄── fulfillment receipt ─┤                       │
```

---

## Dashboard

The dashboard is a polished Next.js 15 application with:

- **Tailwind v4** with `@theme` design tokens (dark mode)
- **shadcn/ui-style components** — Card, Badge, Button, Tabs, ScrollArea, Separator
- **Lucide icons** throughout
- **Inter + JetBrains Mono** fonts
- **Real-time WebSocket** updates from the merchant server

### Monitor Page (`/`)
- **Stat cards** — Total Spent, Payments, Mandates, Status
- **Tabbed interface** — Live Feed, Payments, Mandates, Risk
- **Empty states** with helpful descriptions
- **Animated entries** for new events

### Wallet Setup Page (`/setup`)
- **Multi-step flow** with progress indicator
- **Step 1**: Create passkey wallet (WebAuthn)
- **Step 2**: Configure budget (daily limit, per-tx limit, session duration)
- **Step 3**: Authorize agent (generates + encrypts session key)
- **Session status** display with revoke button
- **Credential details** for debugging

---

## Submission Checklist

### Track 1: Best Agentic App
- [x] Real-world workflow: discover → decide → pay/settle → outcome
- [x] Agents/protocols used meaningfully
- [x] Guardrails: spend caps, allowlists, confirmation steps
- [x] Receipts/logs: clear evidence of what agent did and why
- [x] Repo + README + quickstart
- [x] Human-in-the-loop: wallet ownership + budget control + session revocation

### Track 2: Agentic Tool Usage on x402
- [x] x402 in real flow: HTTP 402 → pay → retry (5 tool calls)
- [x] Tool chaining: 4+ paid steps in one workflow
- [x] Cost reasoning: LLM plans based on price/value
- [x] Receipts/logs, spend tracking, step-by-step trace
- [x] Logged spend summary per tool call

### Track 3: Best Integration of AP2
- [x] Clean intent → authorization → settlement flow
- [x] Auditable receipt (structured JSON)
- [x] Clear write-up of where authorization happens
- [x] Demo shows full AP2 flow and failure modes

### Track 4: Best Trading/DeFi Agent
- [x] Executes DeFi action (swap via DEX)
- [x] Risk controls: spend cap, slippage bounds, allowlist, cooldown, time-bound sessions
- [x] Explains why it acted (LLM reasoning + reason codes)
- [x] Auditable trail (tx hashes + reason codes)
- [x] Multi-source research informing trading decisions
- [x] Human-controlled budget with revocable session keys

### Track 5: Encrypted Agents (BITE v2)
- [ ] BITE v2 integration (SKALE-specific — stretch goal)
- [ ] Encrypted trading strategy until execution

---

## Built With

- **[Veridex Agent SDK](../../packages/agent-sdk)** (`@veridex/agentic-payments`) — Universal agentic payments (x402, UCP, ACP, AP2)
- **[Veridex Core SDK](../../packages/sdk)** (`@veridex/sdk`) — Passkey management, session key crypto
- **Express** — Merchant server
- **Next.js 15** — Dashboard
- **Tailwind CSS v4** — Styling with `@theme` design tokens
- **Radix UI** — Accessible component primitives
- **Lucide** — Icons
- **Google Gemini 2.5 Pro** — LLM reasoning (optional — works without API key)
- **TypeScript** — End-to-end type safety

---

## Team

Built by the Veridex Protocol team for the SF Agentic Commerce x402 Hackathon 2026.

## License

MIT
