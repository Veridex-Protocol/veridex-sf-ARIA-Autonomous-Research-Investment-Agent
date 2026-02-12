/**
 * Shared types for ARIA — Autonomous Research & Investment Agent
 *
 * Used across merchant server, agent, and dashboard.
 */

// ---------------------------------------------------------------------------
// Tool / API Definitions
// ---------------------------------------------------------------------------

/** A paid tool the agent can call */
export interface PaidTool {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  priceUSD: number;
  protocol: 'x402' | 'ucp' | 'acp' | 'ap2';
  category: 'market-data' | 'sentiment' | 'routing' | 'execution' | 'analytics';
  parameters: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
  enum?: string[];
}

// ---------------------------------------------------------------------------
// Agent Workflow
// ---------------------------------------------------------------------------

/** A single step in the agent's workflow */
export interface WorkflowStep {
  id: string;
  timestamp: number;
  type: 'discover' | 'reason' | 'authorize' | 'pay' | 'execute' | 'settle' | 'report';
  tool?: string;
  protocol?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  costUSD?: number;
  txHash?: string;
  durationMs: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  reasoning?: string;
  error?: string;
}

/** A complete workflow run */
export interface WorkflowRun {
  id: string;
  startedAt: number;
  completedAt?: number;
  status: 'running' | 'completed' | 'failed';
  objective: string;
  steps: WorkflowStep[];
  totalCostUSD: number;
  budgetUSD: number;
  budgetRemainingUSD: number;
  result?: WorkflowResult;
}

export interface WorkflowResult {
  summary: string;
  recommendation: string;
  confidence: number;
  data: Record<string, unknown>;
  receipts: PaymentReceipt[];
}

// ---------------------------------------------------------------------------
// Payment & Receipts
// ---------------------------------------------------------------------------

export interface PaymentReceipt {
  id: string;
  timestamp: number;
  protocol: 'x402' | 'ucp' | 'acp' | 'ap2';
  tool: string;
  amountUSD: number;
  amountRaw: string;
  token: string;
  network: string;
  txHash?: string;
  from: string;
  to: string;
  status: 'pending' | 'settled' | 'failed';
  settlementTimestamp?: number;
}

// ---------------------------------------------------------------------------
// AP2 Mandate (Track 3)
// ---------------------------------------------------------------------------

export interface AP2MandateRequest {
  intentId: string;
  description: string;
  maxValueUSD: number;
  allowedCategories: string[];
  expiresInSeconds: number;
  tools: string[];
}

export interface AP2Mandate {
  mandateId: string;
  version: string;
  cartMandate: {
    maxValue: { amount: number; currency: string };
    allowedCategories: string[];
    expiresAt: string;
  };
  paymentMandate: {
    provider: string;
    credentialType: string;
  };
  intentMandate: {
    source: string;
    verifiedAt: string;
    description: string;
  };
  status: 'pending' | 'authorized' | 'fulfilled' | 'expired' | 'revoked';
  authorizedAt?: string;
  authorizedBy?: string;
}

export interface AP2Fulfillment {
  mandateId: string;
  fulfillmentId: string;
  steps: WorkflowStep[];
  totalSpent: number;
  receipts: PaymentReceipt[];
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Risk Controls (Track 4)
// ---------------------------------------------------------------------------

export interface RiskPolicy {
  dailyLimitUSD: number;
  perTransactionLimitUSD: number;
  maxAutoApproveUSD: number;
  allowedTokens: string[];
  allowedChains: string[];
  maxSlippageBps: number;
  requireApprovalAboveUSD: number;
  allowedCategories: string[];
  cooldownMs: number;
}

export interface RiskAssessment {
  action: string;
  estimatedCostUSD: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  approved: boolean;
  reason: string;
  policyViolations: string[];
  budgetImpact: {
    before: number;
    after: number;
    percentUsed: number;
  };
}

// ---------------------------------------------------------------------------
// DeFi Actions (Track 4)
// ---------------------------------------------------------------------------

export interface TradeIntent {
  action: 'swap' | 'provide-liquidity' | 'remove-liquidity' | 'stake' | 'unstake';
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut?: string;
  maxSlippageBps: number;
  chain: string;
  dex?: string;
  reasoning: string;
}

export interface TradeResult {
  txHash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  priceImpactBps: number;
  gasUsed: string;
  executedAt: number;
  route: string[];
}

// ---------------------------------------------------------------------------
// Dashboard WebSocket Events
// ---------------------------------------------------------------------------

export type DashboardEvent =
  | { type: 'workflow:started'; data: WorkflowRun }
  | { type: 'workflow:step'; data: { runId: string; step: WorkflowStep } }
  | { type: 'workflow:completed'; data: WorkflowRun }
  | { type: 'payment:receipt'; data: PaymentReceipt }
  | { type: 'risk:assessment'; data: RiskAssessment }
  | { type: 'mandate:created'; data: AP2Mandate }
  | { type: 'mandate:authorized'; data: AP2Mandate }
  | { type: 'mandate:fulfilled'; data: AP2Fulfillment }
  | { type: 'agent:log'; data: { level: string; message: string; timestamp: number } };
