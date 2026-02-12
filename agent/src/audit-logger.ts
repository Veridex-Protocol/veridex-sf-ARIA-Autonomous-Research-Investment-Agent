/**
 * ARIA Audit Logger
 *
 * Structured logging for every agent action — tool calls, payments, risk
 * assessments, and trade executions. Produces the audit trail required
 * by Tracks 1-4.
 */

import type {
  WorkflowStep,
  WorkflowRun,
  PaymentReceipt,
  RiskAssessment,
  AP2Mandate,
  AP2Fulfillment,
  DashboardEvent,
} from '../../shared/types.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

export class AuditLogger {
  private entries: LogEntry[] = [];
  private receipts: PaymentReceipt[] = [];
  private riskAssessments: RiskAssessment[] = [];
  private mandates: AP2Mandate[] = [];
  private onEvent?: (event: DashboardEvent) => void;

  constructor(opts?: { onEvent?: (event: DashboardEvent) => void }) {
    this.onEvent = opts?.onEvent;
  }

  // -----------------------------------------------------------------------
  // Core logging
  // -----------------------------------------------------------------------

  log(level: LogLevel, category: string, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = { timestamp: Date.now(), level, category, message, data };
    this.entries.push(entry);

    const prefix = { debug: '🔍', info: '📋', warn: '⚠️', error: '❌' }[level];
    const color = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' }[level];
    console.log(`${color}${prefix} [${category}] ${message}\x1b[0m`);
    if (data && level !== 'debug') {
      console.log(`   ${JSON.stringify(data, null, 0)}`);
    }

    this.onEvent?.({ type: 'agent:log', data: { level, message: `[${category}] ${message}`, timestamp: Date.now() } });
  }

  debug(category: string, message: string, data?: Record<string, unknown>) { this.log('debug', category, message, data); }
  info(category: string, message: string, data?: Record<string, unknown>) { this.log('info', category, message, data); }
  warn(category: string, message: string, data?: Record<string, unknown>) { this.log('warn', category, message, data); }
  error(category: string, message: string, data?: Record<string, unknown>) { this.log('error', category, message, data); }

  // -----------------------------------------------------------------------
  // Structured event logging
  // -----------------------------------------------------------------------

  logPayment(receipt: PaymentReceipt) {
    this.receipts.push(receipt);
    this.info('payment', `${receipt.protocol.toUpperCase()} payment: $${receipt.amountUSD.toFixed(4)} for ${receipt.tool}`, {
      txHash: receipt.txHash,
      protocol: receipt.protocol,
      from: receipt.from,
      to: receipt.to,
    });
    this.onEvent?.({ type: 'payment:receipt', data: receipt });
  }

  logRiskAssessment(assessment: RiskAssessment) {
    this.riskAssessments.push(assessment);
    const icon = assessment.approved ? '✅' : '🚫';
    this.info('risk', `${icon} ${assessment.action}: ${assessment.reason}`, {
      riskLevel: assessment.riskLevel,
      costUSD: assessment.estimatedCostUSD,
      budgetUsed: `${assessment.budgetImpact.percentUsed.toFixed(1)}%`,
    });
    this.onEvent?.({ type: 'risk:assessment', data: assessment });
  }

  logMandate(mandate: AP2Mandate) {
    this.mandates.push(mandate);
    this.info('ap2', `Mandate ${mandate.mandateId}: ${mandate.status}`, {
      maxValue: mandate.cartMandate.maxValue,
      categories: mandate.cartMandate.allowedCategories,
    });
  }

  logWorkflowStep(runId: string, step: WorkflowStep) {
    const icon = { pending: '⏳', running: '🔄', success: '✅', failed: '❌', skipped: '⏭️' }[step.status];
    this.info('workflow', `${icon} Step ${step.id}: ${step.type}${step.tool ? ` (${step.tool})` : ''} — ${step.status}`, {
      durationMs: step.durationMs,
      costUSD: step.costUSD,
      protocol: step.protocol,
    });
    this.onEvent?.({ type: 'workflow:step', data: { runId, step } });
  }

  // -----------------------------------------------------------------------
  // Reports
  // -----------------------------------------------------------------------

  getFullReport() {
    const totalSpent = this.receipts.reduce((sum, r) => sum + r.amountUSD, 0);
    const byProtocol = this.receipts.reduce((acc, r) => {
      acc[r.protocol] = (acc[r.protocol] || 0) + r.amountUSD;
      return acc;
    }, {} as Record<string, number>);
    const byTool = this.receipts.reduce((acc, r) => {
      acc[r.tool] = (acc[r.tool] || 0) + r.amountUSD;
      return acc;
    }, {} as Record<string, number>);

    return {
      summary: {
        totalPayments: this.receipts.length,
        totalSpentUSD: totalSpent,
        spendByProtocol: byProtocol,
        spendByTool: byTool,
        riskAssessments: this.riskAssessments.length,
        mandatesCreated: this.mandates.length,
        logEntries: this.entries.length,
      },
      receipts: this.receipts,
      riskAssessments: this.riskAssessments,
      mandates: this.mandates,
      logs: this.entries,
    };
  }

  getReceipts() { return [...this.receipts]; }
  getRiskAssessments() { return [...this.riskAssessments]; }
}
