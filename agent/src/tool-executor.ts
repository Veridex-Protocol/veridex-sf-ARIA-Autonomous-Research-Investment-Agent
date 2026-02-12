/**
 * ARIA Tool Executor
 *
 * Executes paid tool calls against the merchant server using the real
 * AgentWallet.fetch() from @veridex/agentic-payments.
 *
 * The SDK's universal fetch handles the full payment lifecycle:
 *   1. Makes the initial HTTP request
 *   2. Detects the payment protocol (x402/UCP/ACP/AP2) from the response
 *   3. Estimates cost and checks session spending limits
 *   4. Signs an ERC-3009 authorization via the session key
 *   5. Retries the request with the payment proof header
 *   6. Records spending against the session's daily limit
 *
 * This executor layers on top with:
 *   - Pre-flight risk assessment (RiskEngine)
 *   - Structured audit logging (AuditLogger)
 *   - Protocol preference hints
 *   - Workflow step tracking for the dashboard
 */

import { v4 as uuid } from 'uuid';
import {
  createAgentWallet,
  AgentWallet,
} from '@veridex/agentic-payments';
import type {
  UniversalFetchOptions,
  PaymentSettlement,
  CostEstimate,
} from '@veridex/agentic-payments';
import { RiskEngine } from './risk-engine.js';
import { AuditLogger } from './audit-logger.js';
import type { PaidTool, PaymentReceipt, WorkflowStep } from '../../shared/types.js';

const MERCHANT_BASE = process.env.MERCHANT_URL || 'http://localhost:4000';

// ---------------------------------------------------------------------------
// Wallet initialization
// ---------------------------------------------------------------------------

/**
 * Resolve credentials from one of two sources:
 *   1. Environment variables (for CI / pre-configured deployments)
 *   2. Merchant server (populated by the dashboard after human creates wallet + session key)
 *
 * The correct flow:
 *   - Human creates a passkey wallet in the dashboard (they own it)
 *   - Human sets budget limits and authorizes a session key
 *   - The session key (encrypted private key + config) is sent to the merchant
 *   - This function fetches the session key and passkey credentials from the merchant
 *   - The agent uses the session key for autonomous operation within the authorized budget
 */
interface ResolvedCredentials {
  wallet: {
    credentialId: string;
    publicKeyX: string;
    publicKeyY: string;
    keyHash: string;
  };
  session: {
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
  };
}

async function resolveCredentials(): Promise<ResolvedCredentials> {
  // Source 1: env vars (legacy / CI — uses passkey credentials directly)
  if (
    process.env.VERIDEX_CREDENTIAL_ID &&
    process.env.VERIDEX_PUBLIC_KEY_X &&
    process.env.VERIDEX_PUBLIC_KEY_Y &&
    process.env.VERIDEX_SESSION_KEY
  ) {
    return {
      wallet: {
        credentialId: process.env.VERIDEX_CREDENTIAL_ID,
        publicKeyX: process.env.VERIDEX_PUBLIC_KEY_X,
        publicKeyY: process.env.VERIDEX_PUBLIC_KEY_Y,
        keyHash: process.env.VERIDEX_KEY_HASH || '',
      },
      session: {
        sessionKeyHash: '',
        sessionPublicKey: '',
        sessionAddress: process.env.VERIDEX_SESSION_ADDRESS || '',
        encryptedPrivateKey: process.env.VERIDEX_SESSION_KEY,
        config: {
          dailyLimitUSD: parseFloat(process.env.AGENT_DAILY_LIMIT || '50'),
          perTransactionLimitUSD: parseFloat(process.env.AGENT_PER_TX_LIMIT || '5'),
          expiryHours: 24,
          allowedChains: [30],
        },
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        masterKeyHash: process.env.VERIDEX_KEY_HASH || '',
      },
    };
  }

  // Source 2: fetch from merchant server (set by dashboard /setup page)
  const merchantBase = process.env.MERCHANT_URL || 'http://localhost:4000';
  const maxAttempts = 30; // wait up to 60 s for the user to create a wallet
  const delayMs = 2_000;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${merchantBase}/api/v1/agent/credentials`);
      if (res.ok) {
        const data = await res.json() as any;
        if (data.wallet?.credentialId && data.session?.sessionKeyHash) {
          return data as ResolvedCredentials;
        }
      }
    } catch {
      // merchant not up yet — keep waiting
    }
    if (i === 0) {
      console.log('⏳ Waiting for wallet + session key — open http://localhost:3000/setup to create one...');
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }

  throw new Error(
    'No wallet credentials found. Either set VERIDEX_CREDENTIAL_ID + VERIDEX_SESSION_KEY in .env, ' +
    'or create a wallet from the dashboard at http://localhost:3000/setup',
  );
}

/**
 * Create a real AgentWallet backed by a human-authorized session key.
 *
 * The human creates a passkey wallet and authorizes a budget-constrained session key
 * from the dashboard. The agent imports this session key and operates autonomously
 * within the authorized limits. The human retains full control and can revoke at any time.
 */
async function initWallet(): Promise<AgentWallet> {
  const creds = await resolveCredentials();

  const wallet = await createAgentWallet({
    masterCredential: {
      credentialId: creds.wallet.credentialId,
      publicKeyX: BigInt(creds.wallet.publicKeyX),
      publicKeyY: BigInt(creds.wallet.publicKeyY),
      keyHash: creds.wallet.keyHash,
    },
    session: {
      dailyLimitUSD: creds.session.config.dailyLimitUSD,
      perTransactionLimitUSD: creds.session.config.perTransactionLimitUSD,
      expiryHours: creds.session.config.expiryHours,
      allowedChains: creds.session.config.allowedChains,
    },
    relayerUrl:
      process.env.VERIDEX_RELAYER_URL ||
      'https://amused-kameko-veridex-demo-37453117.koyeb.app/api/v1',
    relayerApiKey: process.env.VERIDEX_RELAYER_KEY,
    x402: {
      defaultFacilitator:
        process.env.VERIDEX_RELAYER_URL ||
        'https://amused-kameko-veridex-demo-37453117.koyeb.app/api/v1',
      paymentTimeoutMs: 15_000,
      maxRetries: 2,
      verifyBeforePay: true,
    },
  });

  return wallet;
}

// ---------------------------------------------------------------------------
// ToolExecutor
// ---------------------------------------------------------------------------

export class ToolExecutor {
  private riskEngine: RiskEngine;
  private logger: AuditLogger;
  private toolRegistry: PaidTool[] = [];
  private wallet: AgentWallet | null = null;
  private walletReady: Promise<AgentWallet>;

  constructor(riskEngine: RiskEngine, logger: AuditLogger) {
    this.riskEngine = riskEngine;
    this.logger = logger;

    // Begin wallet initialization immediately (non-blocking)
    this.walletReady = initWallet()
      .then((w) => {
        this.wallet = w;
        this.logger.info('wallet', 'AgentWallet initialized — real x402/UCP/ACP/AP2 payments enabled');
        return w;
      })
      .catch((err) => {
        this.logger.warn('wallet', `AgentWallet init failed: ${err.message} — falling back to plain fetch`);
        return null as any;
      });
  }

  // -----------------------------------------------------------------------
  // Discovery
  // -----------------------------------------------------------------------

  /**
   * Discover available tools from the merchant server (free endpoint).
   */
  async discoverTools(): Promise<PaidTool[]> {
    this.logger.info('discovery', `Discovering tools from ${MERCHANT_BASE}/api/v1/tools`);
    const res = await fetch(`${MERCHANT_BASE}/api/v1/tools`);
    const data = (await res.json()) as { tools: PaidTool[] };
    this.toolRegistry = data.tools;
    this.logger.info('discovery', `Found ${this.toolRegistry.length} paid tools`, {
      tools: this.toolRegistry.map((t) => ({ id: t.id, price: `$${t.priceUSD}`, category: t.category })),
    });
    return this.toolRegistry;
  }

  /**
   * Get the total cost of calling a set of tools (for budget planning).
   */
  estimateWorkflowCost(toolIds: string[]): number {
    return toolIds.reduce((sum, id) => {
      const tool = this.toolRegistry.find((t) => t.id === id);
      return sum + (tool?.priceUSD || 0);
    }, 0);
  }

  // -----------------------------------------------------------------------
  // Execute
  // -----------------------------------------------------------------------

  /**
   * Execute a paid tool call with risk assessment, real payment, and logging.
   *
   * Flow:
   *   1. Look up tool in registry
   *   2. Run RiskEngine pre-flight check
   *   3. Call merchant endpoint via AgentWallet.fetch()
   *      – SDK auto-detects protocol from the 402 response
   *      – SDK signs ERC-3009 transferWithAuthorization via session key
   *      – SDK retries with PAYMENT-SIGNATURE / x-ucp-payment-credential / etc.
   *      – SDK records spending against session limits
   *   4. Log structured PaymentReceipt from the settlement callback
   *   5. Return workflow step + parsed response data
   */
  async executeTool(
    toolId: string,
    params: Record<string, unknown>,
    protocolHint: 'x402' | 'ucp' | 'acp' | 'ap2' = 'x402',
  ): Promise<{ step: WorkflowStep; data: any }> {
    const tool = this.toolRegistry.find((t) => t.id === toolId);
    if (!tool) throw new Error(`Tool not found: ${toolId}`);

    const stepId = uuid().slice(0, 8);
    const startTime = Date.now();

    // 1. Risk assessment
    const assessment = this.riskEngine.assess(`tool:${toolId}`, tool.priceUSD, {
      category: tool.category,
    });
    this.logger.logRiskAssessment(assessment);

    if (!assessment.approved) {
      const step: WorkflowStep = {
        id: stepId,
        timestamp: startTime,
        type: 'pay',
        tool: toolId,
        protocol: protocolHint,
        costUSD: tool.priceUSD,
        durationMs: Date.now() - startTime,
        status: 'failed',
        reasoning: assessment.reason,
        error: `Risk policy violation: ${assessment.policyViolations.join('; ')}`,
      };
      this.logger.logWorkflowStep('current', step);
      return { step, data: null };
    }

    // 2. Build request URL + options
    const url = new URL(tool.endpoint, MERCHANT_BASE);
    const isPost = tool.endpoint.includes('execute');
    if (!isPost) {
      for (const [key, val] of Object.entries(params)) {
        url.searchParams.set(key, String(val));
      }
    }

    this.logger.info('tool', `Calling ${tool.name} ($${tool.priceUSD}) via ${protocolHint}...`, { params });

    // 3. Execute via AgentWallet.fetch() — real payment flow
    let data: any;
    let settlement: PaymentSettlement | null = null;
    let detectedProtocol: string = protocolHint;
    let costEstimate: CostEstimate | null = null;

    try {
      const wallet = await this.walletReady;

      // Build UniversalFetchOptions with protocol hint and callbacks
      const fetchOpts: UniversalFetchOptions = {
        method: isPost ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        ...(isPost ? { body: JSON.stringify(params) } : {}),

        // Hint the preferred protocol (SDK still auto-detects, but prefers this)
        protocol: protocolHint,

        // Cap auto-approval at the tool's listed price + 10% buffer
        maxAutoApproveUSD: tool.priceUSD * 1.1,

        // Capture cost estimate before payment
        onBeforePayment: async (estimate: CostEstimate) => {
          costEstimate = estimate;
          this.logger.info('payment', `Cost estimate: $${estimate.amountUSD.toFixed(4)} ${estimate.token} (${estimate.scheme})`, {
            amountRaw: estimate.amountRaw,
            chain: estimate.chain,
            confidence: estimate.confidence,
          });
          // Approve if within risk engine's per-tx limit
          return estimate.amountUSD <= this.riskEngine.getPolicy().perTransactionLimitUSD;
        },

        // Capture settlement receipt after payment
        onAfterPayment: (s: PaymentSettlement) => {
          settlement = s;
          this.logger.info('payment', `Settlement: ${s.protocol} | ${s.success ? 'success' : 'failed'} | ${s.network}`, {
            txHash: s.txHash,
            amount: s.amount,
            token: s.token,
            amountUSD: s.amountUSD,
          });
        },

        // Track which protocol was actually used
        onProtocolDetected: (result) => {
          detectedProtocol = result.protocol;
          this.logger.info('protocol', `Detected: ${result.protocol} (confidence: ${result.confidence})`, {
            url: result.metadata?.url,
            status: result.metadata?.status,
          });
        },
      };

      // This is the real call — SDK handles:
      //   → Initial request → 402 → parse PAYMENT-REQUIRED → sign ERC-3009
      //   → retry with PAYMENT-SIGNATURE → return 200 response
      const response = wallet
        ? await wallet.fetch(url.toString(), fetchOpts)
        : await this.fallbackFetch(url.toString(), fetchOpts);

      if (!response.ok) {
        throw new Error(`Tool call failed: ${response.status} ${response.statusText}`);
      }

      data = await response.json();
    } catch (err: any) {
      const step: WorkflowStep = {
        id: stepId,
        timestamp: startTime,
        type: 'execute',
        tool: toolId,
        protocol: detectedProtocol,
        input: params,
        costUSD: 0,
        durationMs: Date.now() - startTime,
        status: 'failed',
        error: err.message,
      };
      this.logger.logWorkflowStep('current', step);
      this.logger.error('tool', `Tool ${toolId} failed: ${err.message}`);
      return { step, data: null };
    }

    // 4. Record payment in risk engine + log structured receipt
    const actualCostUSD = costEstimate?.amountUSD ?? tool.priceUSD;
    this.riskEngine.recordAction(`tool:${toolId}`, actualCostUSD, true);

    const receipt: PaymentReceipt = {
      id: uuid(),
      timestamp: Date.now(),
      protocol: detectedProtocol as PaymentReceipt['protocol'],
      tool: toolId,
      amountUSD: actualCostUSD,
      amountRaw: costEstimate?.amountRaw ?? String(Math.round(tool.priceUSD * 1_000_000)),
      token: costEstimate?.token ?? 'USDC',
      network: settlement?.network ?? process.env.NETWORK ?? 'base-sepolia',
      from: process.env.VERIDEX_SESSION_ADDRESS ?? '0xagent',
      to: process.env.MERCHANT_RECIPIENT_ADDRESS ?? '0xmerchant',
      txHash: settlement?.txHash,
      status: settlement?.success !== false ? 'settled' : 'failed',
    };
    this.logger.logPayment(receipt);

    // 5. Build workflow step
    const step: WorkflowStep = {
      id: stepId,
      timestamp: startTime,
      type: 'execute',
      tool: toolId,
      protocol: detectedProtocol,
      input: params,
      output: data,
      costUSD: actualCostUSD,
      txHash: settlement?.txHash,
      durationMs: Date.now() - startTime,
      status: 'success',
      reasoning: `Called ${tool.name} for $${actualCostUSD.toFixed(4)} via ${detectedProtocol} — risk level: ${assessment.riskLevel}`,
    };
    this.logger.logWorkflowStep('current', step);

    return { step, data };
  }

  // -----------------------------------------------------------------------
  // Fallback (when wallet credentials are not configured)
  // -----------------------------------------------------------------------

  /**
   * Plain fetch fallback for environments where the wallet is not configured.
   * The merchant server's veridexPaywall will still return 402, so this will
   * only work against unprotected endpoints or in development mode.
   */
  private async fallbackFetch(url: string, opts: RequestInit): Promise<Response> {
    this.logger.warn('wallet', 'Using plain fetch — no payment credentials. Set VERIDEX_SESSION_KEY to enable real payments.');
    return globalThis.fetch(url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body,
    });
  }

  // -----------------------------------------------------------------------
  // Accessors
  // -----------------------------------------------------------------------

  getToolRegistry() {
    return [...this.toolRegistry];
  }

  getRiskEngine() {
    return this.riskEngine;
  }

  /** Get the underlying AgentWallet (null if not yet initialized) */
  getWallet() {
    return this.wallet;
  }
}
