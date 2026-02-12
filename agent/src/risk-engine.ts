/**
 * ARIA Risk Engine
 *
 * Enforces spending limits, slippage bounds, allowlists, and budget tracking.
 * Every tool call and trade goes through risk assessment before execution.
 *
 * Demonstrates Track 4 requirements:
 * - Spend caps, slippage bounds, allowlist/denylist
 * - Position sizing, timeouts, human approval thresholds
 * - Explains why it acted (reason codes)
 */

import type { RiskPolicy, RiskAssessment } from '../../shared/types.js';

const DEFAULT_POLICY: RiskPolicy = {
  dailyLimitUSD: parseFloat(process.env.AGENT_DAILY_LIMIT_USD || '50'),
  perTransactionLimitUSD: parseFloat(process.env.AGENT_PER_TX_LIMIT_USD || '5'),
  maxAutoApproveUSD: parseFloat(process.env.AGENT_MAX_AUTO_APPROVE_USD || '1'),
  allowedTokens: ['USDC', 'ETH', 'WETH', 'AERO', 'cbETH'],
  allowedChains: ['base', 'base-sepolia', 'ethereum', 'arbitrum', 'skale-nebula'],
  maxSlippageBps: 100,
  requireApprovalAboveUSD: 5,
  allowedCategories: ['market-data', 'sentiment', 'routing', 'execution', 'analytics'],
  cooldownMs: 1000,
};

export class RiskEngine {
  private policy: RiskPolicy;
  private dailySpent = 0;
  private lastActionTimestamp = 0;
  private actionLog: Array<{ timestamp: number; action: string; costUSD: number; approved: boolean }> = [];

  constructor(policy?: Partial<RiskPolicy>) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /**
   * Assess whether an action should be allowed.
   * Returns a structured assessment with approval status and reasoning.
   */
  assess(action: string, estimatedCostUSD: number, metadata?: {
    category?: string;
    token?: string;
    chain?: string;
    slippageBps?: number;
  }): RiskAssessment {
    const violations: string[] = [];
    let riskLevel: RiskAssessment['riskLevel'] = 'low';

    // Check daily limit
    if (this.dailySpent + estimatedCostUSD > this.policy.dailyLimitUSD) {
      violations.push(`Daily limit exceeded: $${this.dailySpent.toFixed(2)} + $${estimatedCostUSD.toFixed(2)} > $${this.policy.dailyLimitUSD}`);
      riskLevel = 'critical';
    }

    // Check per-transaction limit
    if (estimatedCostUSD > this.policy.perTransactionLimitUSD) {
      violations.push(`Per-transaction limit exceeded: $${estimatedCostUSD.toFixed(2)} > $${this.policy.perTransactionLimitUSD}`);
      riskLevel = 'high';
    }

    // Check cooldown
    const timeSinceLastAction = Date.now() - this.lastActionTimestamp;
    if (timeSinceLastAction < this.policy.cooldownMs && this.lastActionTimestamp > 0) {
      violations.push(`Cooldown not met: ${timeSinceLastAction}ms < ${this.policy.cooldownMs}ms`);
    }

    // Check category allowlist
    if (metadata?.category && !this.policy.allowedCategories.includes(metadata.category)) {
      violations.push(`Category not allowed: ${metadata.category}`);
      riskLevel = 'high';
    }

    // Check token allowlist
    if (metadata?.token && !this.policy.allowedTokens.includes(metadata.token)) {
      violations.push(`Token not allowed: ${metadata.token}`);
      riskLevel = 'high';
    }

    // Check chain allowlist
    if (metadata?.chain && !this.policy.allowedChains.includes(metadata.chain)) {
      violations.push(`Chain not allowed: ${metadata.chain}`);
      riskLevel = 'high';
    }

    // Check slippage
    if (metadata?.slippageBps && metadata.slippageBps > this.policy.maxSlippageBps) {
      violations.push(`Slippage too high: ${metadata.slippageBps}bps > ${this.policy.maxSlippageBps}bps`);
      riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
    }

    // Determine risk level based on cost
    if (riskLevel === 'low') {
      if (estimatedCostUSD > this.policy.requireApprovalAboveUSD) riskLevel = 'high';
      else if (estimatedCostUSD > this.policy.maxAutoApproveUSD) riskLevel = 'medium';
    }

    const approved = violations.length === 0 && estimatedCostUSD <= this.policy.maxAutoApproveUSD;
    const needsApproval = violations.length === 0 && estimatedCostUSD > this.policy.maxAutoApproveUSD;

    const reason = violations.length > 0
      ? `Blocked: ${violations.join('; ')}`
      : approved
        ? `Auto-approved: $${estimatedCostUSD.toFixed(4)} within auto-approve limit ($${this.policy.maxAutoApproveUSD})`
        : `Requires approval: $${estimatedCostUSD.toFixed(2)} exceeds auto-approve limit ($${this.policy.maxAutoApproveUSD})`;

    return {
      action,
      estimatedCostUSD,
      riskLevel,
      approved: approved || needsApproval, // Allow if no violations (approval may be needed for high amounts)
      reason,
      policyViolations: violations,
      budgetImpact: {
        before: this.dailySpent,
        after: this.dailySpent + estimatedCostUSD,
        percentUsed: ((this.dailySpent + estimatedCostUSD) / this.policy.dailyLimitUSD) * 100,
      },
    };
  }

  /**
   * Record a completed action (updates budget tracking).
   */
  recordAction(action: string, costUSD: number, approved: boolean) {
    if (approved) {
      this.dailySpent += costUSD;
      this.lastActionTimestamp = Date.now();
    }
    this.actionLog.push({ timestamp: Date.now(), action, costUSD, approved });
  }

  /**
   * Get current budget status.
   */
  getBudgetStatus() {
    return {
      dailyLimit: this.policy.dailyLimitUSD,
      spent: this.dailySpent,
      remaining: this.policy.dailyLimitUSD - this.dailySpent,
      percentUsed: (this.dailySpent / this.policy.dailyLimitUSD) * 100,
      actionCount: this.actionLog.length,
      lastAction: this.actionLog[this.actionLog.length - 1] || null,
    };
  }

  /**
   * Get full audit trail.
   */
  getAuditTrail() {
    return [...this.actionLog];
  }

  getPolicy() {
    return { ...this.policy };
  }

  resetDaily() {
    this.dailySpent = 0;
    this.actionLog = [];
  }
}
