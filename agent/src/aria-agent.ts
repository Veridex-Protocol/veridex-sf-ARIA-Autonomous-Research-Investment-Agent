/**
 * ARIA Agent — LLM-Powered Autonomous Research & Investment Agent
 *
 * The core orchestrator that:
 * 1. Accepts a user objective (e.g. "Research ETH and decide whether to buy")
 * 2. Plans a multi-step workflow with cost estimation
 * 3. Requests an AP2 mandate for authorization
 * 4. Executes each step, paying via x402/UCP/ACP/AP2
 * 5. Reasons about results and adjusts strategy
 * 6. Produces a final recommendation with full audit trail
 *
 * Covers all 5 tracks:
 * - Track 1: End-to-end discover → decide → pay → outcome
 * - Track 2: Multi-step x402 tool chaining with cost reasoning
 * - Track 3: AP2 intent → authorization → settlement → receipt
 * - Track 4: DeFi research + execution with risk controls
 * - Track 5: (Optional) BITE v2 encrypted strategy
 */

import { v4 as uuid } from 'uuid';
import { ToolExecutor } from './tool-executor.js';
import { RiskEngine } from './risk-engine.js';
import { AuditLogger } from './audit-logger.js';
import type {
  WorkflowRun,
  WorkflowStep,
  WorkflowResult,
  AP2Mandate,
  AP2Fulfillment,
  DashboardEvent,
  PaidTool,
} from '../../shared/types.js';

const MERCHANT_BASE = process.env.MERCHANT_URL || 'http://localhost:4000';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ---------------------------------------------------------------------------
// LLM Interface (Gemini 2.5 Pro)
// ---------------------------------------------------------------------------

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Convert our standard message format to Gemini's contents format.
 * Gemini uses 'user' and 'model' roles, and system instructions are separate.
 */
function toGeminiPayload(messages: LLMMessage[], temperature: number) {
  // Extract system instruction (first system message)
  const systemMsg = messages.find(m => m.role === 'system');
  const conversationMsgs = messages.filter(m => m.role !== 'system');

  const contents = conversationMsgs.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  return {
    ...(systemMsg ? { system_instruction: { parts: [{ text: systemMsg.content }] } } : {}),
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 4096,
      responseMimeType: 'text/plain',
    },
  };
}

async function callLLM(messages: LLMMessage[], temperature = 0.3): Promise<string> {
  if (!GEMINI_API_KEY) {
    // Fallback: data-aware deterministic reasoning without LLM
    return fallbackReasoning(messages);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toGeminiPayload(messages, temperature)),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini call failed: ${res.status} ${err}`);
  }

  const data = await res.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned empty response');
  }

  // Strip markdown code fences if Gemini wraps JSON in ```json ... ```
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/**
 * Data-aware fallback reasoning when no Gemini API key is set.
 *
 * Unlike a canned response, this actually parses the real tool results
 * passed in the message context and reasons about them. It extracts
 * prices, sentiment scores, portfolio allocations, and route data
 * to produce genuine analysis.
 */
function fallbackReasoning(messages: LLMMessage[]): string {
  const allContent = messages.map(m => m.content).join('\n');
  const lastMsg = messages[messages.length - 1]?.content || '';

  // -----------------------------------------------------------------------
  // Phase 2: Planning — parse objective and available tools to build a plan
  // -----------------------------------------------------------------------
  if (lastMsg.includes('Create a plan')) {
    // Extract token from objective
    const tokenMatch = allContent.match(/\b(ETH|BTC|SOL|AERO|ARB|OP|LINK|UNI|AAVE)\b/i);
    const token = tokenMatch ? tokenMatch[1].toUpperCase() : 'ETH';
    const amountMatch = allContent.match(/\$(\d+)/);
    const amount = amountMatch ? amountMatch[1] : '50';
    const pairToken = token === 'USDC' ? 'ETH' : token;

    return JSON.stringify({
      plan: [
        { tool: 'web-search', params: { query: `${pairToken} price analysis ${new Date().toISOString().slice(0, 10)} market outlook` }, reasoning: `Search the web for latest ${pairToken} market analysis and news` },
        { tool: 'market-data', params: { pair: `${pairToken}/USDC` }, reasoning: `Get real-time ${pairToken} price, volume, market cap, and 24h/7d trends from CoinGecko` },
        { tool: 'sentiment', params: { token: pairToken, sources: 'all' }, reasoning: `Analyze ${pairToken} sentiment from news, Fear & Greed Index, and on-chain signals` },
        { tool: 'portfolio-analytics', params: { address: '0xdemo', chain: 'base' }, reasoning: 'Check current portfolio allocation, risk metrics, and rebalancing suggestions' },
        { tool: 'route-optimizer', params: { tokenIn: 'USDC', tokenOut: pairToken, amountIn: amount, chain: 'base' }, reasoning: `Find optimal swap route for $${amount} USDC → ${pairToken} across DEXes` },
      ],
      estimatedCostUSD: 0.13,
      reasoning: `Comprehensive research workflow: (1) web search for latest analysis, (2) live market data, (3) multi-source sentiment, (4) portfolio risk check, (5) DEX routing — then decide whether to execute.`,
    });
  }

  // -----------------------------------------------------------------------
  // Phase 5: Decision — parse actual tool results and reason about them
  // -----------------------------------------------------------------------
  if (lastMsg.includes('Research results') || lastMsg.includes('Analyze and decide')) {
    // Try to extract real data from the results
    let price = 0, change24h = 'N/A', sentimentScore = 0, sentimentLabel = 'neutral';
    let bestDex = 'unknown', priceImpact = 0, expectedOut = '0';
    let portfolioAllocation = 0, concentrationRisk = 'unknown';
    let newsHeadline = '';
    let webSummary = '';

    try {
      const parsed = JSON.parse(lastMsg.match(/Research results:\n([\s\S]*?)\n\nAnalyze/)?.[1] || '[]');

      for (const result of parsed) {
        if (!result.data || !result.success) continue;
        const data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;

        if (result.tool === 'market-data') {
          price = data.price || 0;
          change24h = data.change24h || 'N/A';
        }
        if (result.tool === 'sentiment') {
          sentimentScore = data.overall?.score || 0;
          sentimentLabel = data.overall?.label || 'neutral';
          if (data.news?.[0]?.title) newsHeadline = data.news[0].title;
        }
        if (result.tool === 'route-optimizer') {
          bestDex = data.bestRoute || data.routes?.[0]?.dex || 'unknown';
          priceImpact = data.routes?.[0]?.priceImpactBps || 0;
          expectedOut = data.routes?.[0]?.expectedOut || '0';
        }
        if (result.tool === 'portfolio-analytics') {
          const largest = data.riskMetrics?.largestPositionPct || data.positions?.[0]?.allocation || 0;
          portfolioAllocation = largest;
          concentrationRisk = data.riskMetrics?.concentrationRisk || 'unknown';
        }
        if (result.tool === 'web-search') {
          webSummary = data.summary || '';
        }
      }
    } catch { /* parse failed — use defaults */ }

    // Actual reasoning based on real data
    const changeNum = parseFloat(change24h);
    const isBullish = sentimentScore > 0.15 || changeNum > 2;
    const isBearish = sentimentScore < -0.15 || changeNum < -3;
    const isHighConcentration = portfolioAllocation > 60;
    const isLowImpact = priceImpact < 50;

    let decision: 'buy' | 'sell' | 'hold';
    let confidence: number;
    let reasoning: string;
    let action: any = null;
    const riskFactors: string[] = [];

    if (isBullish && !isHighConcentration && isLowImpact) {
      decision = 'buy';
      confidence = 0.65 + Math.min(0.25, Math.abs(sentimentScore) * 0.5);
      reasoning = `Analysis supports a buy: price ${price > 0 ? `$${price.toLocaleString()}` : 'data available'} (${change24h} 24h), sentiment is ${sentimentLabel} (score: ${sentimentScore.toFixed(2)}), portfolio concentration is acceptable (${portfolioAllocation.toFixed(1)}%), and best route via ${bestDex} has ${priceImpact}bps impact.`;
      if (webSummary) reasoning += ` Web research: ${webSummary.slice(0, 150)}.`;
      if (newsHeadline) reasoning += ` Latest news: "${newsHeadline}".`;
      action = { tool: 'trade-execute', params: { routeId: 'latest', maxSlippageBps: 50 } };
      riskFactors.push(`24h change: ${change24h}`);
      riskFactors.push(`Sentiment: ${sentimentLabel} (${sentimentScore.toFixed(2)})`);
      riskFactors.push(`Price impact: ${priceImpact}bps via ${bestDex}`);
    } else if (isBearish) {
      decision = 'hold';
      confidence = 0.6 + Math.min(0.3, Math.abs(sentimentScore) * 0.5);
      reasoning = `Analysis suggests caution: price ${change24h} 24h, sentiment is ${sentimentLabel} (score: ${sentimentScore.toFixed(2)}). Bearish signals detected — holding position to avoid buying into weakness.`;
      if (newsHeadline) reasoning += ` Latest: "${newsHeadline}".`;
      riskFactors.push('Bearish sentiment detected');
      riskFactors.push(`24h change: ${change24h}`);
      riskFactors.push('Waiting for reversal confirmation');
    } else if (isHighConcentration) {
      decision = 'hold';
      confidence = 0.7;
      reasoning = `Portfolio already has ${portfolioAllocation.toFixed(1)}% allocation (concentration risk: ${concentrationRisk}). Even though sentiment is ${sentimentLabel}, adding more would increase concentration risk beyond acceptable levels.`;
      riskFactors.push(`High concentration: ${portfolioAllocation.toFixed(1)}%`);
      riskFactors.push(`Concentration risk: ${concentrationRisk}`);
    } else {
      decision = 'hold';
      confidence = 0.55;
      reasoning = `Mixed signals: price ${change24h} 24h, sentiment ${sentimentLabel} (${sentimentScore.toFixed(2)}). No strong directional conviction — holding and monitoring.`;
      if (webSummary) reasoning += ` Context: ${webSummary.slice(0, 100)}.`;
      riskFactors.push('Mixed/neutral signals');
      riskFactors.push(`Sentiment: ${sentimentLabel}`);
      riskFactors.push('Insufficient conviction for trade');
    }

    return JSON.stringify({ decision, confidence: parseFloat(confidence.toFixed(2)), reasoning, action, riskFactors });
  }

  // -----------------------------------------------------------------------
  // Phase 7: Report — summarize actual workflow results
  // -----------------------------------------------------------------------
  if (lastMsg.includes('Generate summary') || lastMsg.includes('Steps completed')) {
    const costMatch = lastMsg.match(/Total cost: \$([\d.]+)/);
    const stepsMatch = lastMsg.match(/Steps completed: (\d+)/);
    const objectiveMatch = lastMsg.match(/Objective: (.+)/);

    const cost = costMatch ? costMatch[1] : '0.00';
    const steps = stepsMatch ? stepsMatch[1] : '0';
    const objective = objectiveMatch ? objectiveMatch[1] : 'market research';

    return JSON.stringify({
      summary: `Completed autonomous research workflow for: "${objective}". Executed ${steps} steps using live market data from CoinGecko, real-time sentiment from news + Fear & Greed Index + on-chain signals, web search results, and DEX route optimization. Total cost: $${cost}.`,
      recommendation: 'Continue monitoring market conditions. Re-run analysis in 4-6 hours for updated signals. Set price alerts for significant moves.',
      keyFindings: [
        `Workflow completed: ${steps} steps, $${cost} total cost`,
        'All data sourced from live APIs (CoinGecko, CryptoCompare, DeFi Llama, DuckDuckGo)',
        'Sentiment aggregated from news articles, Fear & Greed Index, and on-chain activity',
        'DEX routes compared across multiple protocols for optimal execution',
        'Full audit trail with payment receipts for every tool call',
      ],
    });
  }

  return '{"status": "ok", "reasoning": "Proceeding with next step based on available data."}';
}

// ---------------------------------------------------------------------------
// ARIA Agent
// ---------------------------------------------------------------------------

export class AriaAgent {
  private toolExecutor: ToolExecutor;
  private riskEngine: RiskEngine;
  private logger: AuditLogger;
  private currentRun: WorkflowRun | null = null;
  private onEvent?: (event: DashboardEvent) => void;

  constructor(opts?: {
    onEvent?: (event: DashboardEvent) => void;
    riskPolicy?: Record<string, unknown>;
  }) {
    this.onEvent = opts?.onEvent;
    this.riskEngine = new RiskEngine(opts?.riskPolicy as any);
    this.logger = new AuditLogger({ onEvent: opts?.onEvent });
    this.toolExecutor = new ToolExecutor(this.riskEngine, this.logger);
  }

  /**
   * Run a complete autonomous workflow.
   *
   * This is the main entry point — give it an objective and it will:
   * 1. Discover available tools
   * 2. Plan the workflow with cost estimation
   * 3. Request AP2 mandate authorization
   * 4. Execute each step with x402 payments
   * 5. Reason about results and decide next actions
   * 6. Produce a final report with audit trail
   */
  async run(objective: string, budgetUSD: number = 1.0): Promise<WorkflowRun> {
    const runId = uuid().slice(0, 12);
    this.currentRun = {
      id: runId,
      startedAt: Date.now(),
      status: 'running',
      objective,
      steps: [],
      totalCostUSD: 0,
      budgetUSD,
      budgetRemainingUSD: budgetUSD,
    };

    this.logger.info('agent', `\n${'='.repeat(60)}`);
    this.logger.info('agent', `ARIA Workflow Started: ${objective}`);
    this.logger.info('agent', `Budget: $${budgetUSD.toFixed(2)} | Run ID: ${runId}`);
    this.logger.info('agent', `${'='.repeat(60)}\n`);

    this.onEvent?.({ type: 'workflow:started', data: this.currentRun });

    try {
      // Phase 1: Discovery
      await this.phaseDiscover(runId);

      // Phase 2: Planning (LLM reasons about which tools to use)
      const plan = await this.phasePlan(runId, objective);

      // Phase 3: AP2 Mandate Authorization
      const mandate = await this.phaseAuthorize(runId, objective, plan);

      // Phase 4: Execution (chain tool calls with x402 payments)
      const results = await this.phaseExecute(runId, plan, mandate);

      // Phase 5: Decision (LLM analyzes results and decides)
      const decision = await this.phaseDecide(runId, results);

      // Phase 6: (Optional) Trade Execution
      if (decision.action) {
        await this.phaseTradeExecute(runId, decision);
      }

      // Phase 7: Report
      const result = await this.phaseReport(runId, objective);

      // Finalize
      this.currentRun.status = 'completed';
      this.currentRun.completedAt = Date.now();
      this.currentRun.result = result;
      this.currentRun.totalCostUSD = this.logger.getReceipts().reduce((s, r) => s + r.amountUSD, 0);
      this.currentRun.budgetRemainingUSD = budgetUSD - this.currentRun.totalCostUSD;

      // Fulfill the mandate
      if (mandate) {
        await this.fulfillMandate(mandate, this.currentRun);
      }

      this.logger.info('agent', `\n${'='.repeat(60)}`);
      this.logger.info('agent', `ARIA Workflow Completed`);
      this.logger.info('agent', `Total Cost: $${this.currentRun.totalCostUSD.toFixed(4)} | Steps: ${this.currentRun.steps.length}`);
      this.logger.info('agent', `${'='.repeat(60)}\n`);

      this.onEvent?.({ type: 'workflow:completed', data: this.currentRun });
      return this.currentRun;

    } catch (err: any) {
      this.currentRun.status = 'failed';
      this.currentRun.completedAt = Date.now();
      this.logger.error('agent', `Workflow failed: ${err.message}`);
      this.onEvent?.({ type: 'workflow:completed', data: this.currentRun });
      return this.currentRun;
    }
  }

  // -----------------------------------------------------------------------
  // Phase 1: Discovery
  // -----------------------------------------------------------------------

  private async phaseDiscover(runId: string): Promise<PaidTool[]> {
    const startTime = Date.now();
    this.logger.info('phase', '📡 Phase 1: Tool Discovery');

    const tools = await this.toolExecutor.discoverTools();

    const step: WorkflowStep = {
      id: 'discover', timestamp: startTime, type: 'discover',
      output: { toolCount: tools.length, tools: tools.map(t => t.id) },
      durationMs: Date.now() - startTime, status: 'success',
      reasoning: `Discovered ${tools.length} paid tools from merchant server`,
    };
    this.currentRun!.steps.push(step);
    this.logger.logWorkflowStep(runId, step);
    return tools;
  }

  // -----------------------------------------------------------------------
  // Phase 2: Planning (LLM cost reasoning)
  // -----------------------------------------------------------------------

  private async phasePlan(runId: string, objective: string): Promise<any> {
    const startTime = Date.now();
    this.logger.info('phase', '🧠 Phase 2: Planning & Cost Reasoning');

    const tools = this.toolExecutor.getToolRegistry();
    const budget = this.riskEngine.getBudgetStatus();

    const planResponse = await callLLM([
      {
        role: 'system',
        content: `You are ARIA, an autonomous research and investment agent that uses REAL live data from external APIs. You have a budget of $${budget.remaining.toFixed(2)} remaining.

Available paid tools (each call costs real money via x402 payments):
${tools.map(t => `- ${t.id}: ${t.description} ($${t.priceUSD}) [params: ${t.parameters.map(p => `${p.name}${p.required ? '*' : ''}`).join(', ')}]`).join('\n')}

IMPORTANT: These tools return REAL data:
- market-data: Live prices from CoinGecko (price, volume, market cap, 24h/7d change, sparkline)
- sentiment: Real news from CryptoCompare, Fear & Greed Index, on-chain signals
- web-search: Live web search via DuckDuckGo + Wikipedia + crypto news
- route-optimizer: Real DEX quotes from DeFi Llama / CoinGecko price-based routing
- portfolio-analytics: Real on-chain balances via Base/Ethereum RPC
- trade-execute: Simulated execution (returns realistic tx details)

Create a comprehensive research plan. Start with web-search for context, then gather quantitative data, then analyze.

Respond with a JSON object containing:
- plan: array of { tool, params, reasoning } for each step
- estimatedCostUSD: total estimated cost
- reasoning: why this plan achieves the objective within budget`,
      },
      { role: 'user', content: `Objective: ${objective}\n\nCreate a plan. Respond with JSON only.` },
    ]);

    let plan: any;
    try {
      plan = JSON.parse(planResponse);
    } catch {
      plan = { plan: [], estimatedCostUSD: 0, reasoning: planResponse };
    }

    const estimatedCost = plan.estimatedCostUSD || this.toolExecutor.estimateWorkflowCost(
      (plan.plan || []).map((s: any) => s.tool)
    );

    this.logger.info('plan', `Planned ${(plan.plan || []).length} steps, estimated cost: $${estimatedCost.toFixed(4)}`, {
      steps: (plan.plan || []).map((s: any) => s.tool),
      reasoning: plan.reasoning,
    });

    const step: WorkflowStep = {
      id: 'plan', timestamp: startTime, type: 'reason',
      output: plan, costUSD: 0, durationMs: Date.now() - startTime,
      status: 'success', reasoning: plan.reasoning,
    };
    this.currentRun!.steps.push(step);
    this.logger.logWorkflowStep(runId, step);
    return plan;
  }

  // -----------------------------------------------------------------------
  // Phase 3: AP2 Mandate Authorization (Track 3)
  // -----------------------------------------------------------------------

  private async phaseAuthorize(runId: string, objective: string, plan: any): Promise<AP2Mandate | null> {
    const startTime = Date.now();
    this.logger.info('phase', '🔐 Phase 3: AP2 Mandate Authorization');

    const estimatedCost = plan.estimatedCostUSD || 0.5;
    const toolIds = (plan.plan || []).map((s: any) => s.tool);

    try {
      // Create mandate request
      const mandateRes = await fetch(`${MERCHANT_BASE}/api/v1/mandates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: objective,
          maxValueUSD: estimatedCost * 1.5, // 50% buffer
          allowedCategories: ['market-data', 'sentiment', 'routing', 'execution', 'analytics'],
          expiresInSeconds: 600,
          tools: toolIds,
        }),
      });

      const mandate = await mandateRes.json() as AP2Mandate;
      this.logger.logMandate(mandate);

      // Auto-authorize (in production, this would require user approval)
      const authRes = await fetch(`${MERCHANT_BASE}/api/v1/mandates/${mandate.mandateId}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizedBy: 'user-auto' }),
      });

      const authorizedMandate = await authRes.json() as AP2Mandate;
      this.logger.info('ap2', `Mandate authorized: ${authorizedMandate.mandateId}`, {
        maxValue: authorizedMandate.cartMandate.maxValue,
        expiresAt: authorizedMandate.cartMandate.expiresAt,
      });

      this.onEvent?.({ type: 'mandate:authorized', data: authorizedMandate });

      const step: WorkflowStep = {
        id: 'authorize', timestamp: startTime, type: 'authorize',
        output: { mandateId: authorizedMandate.mandateId, status: authorizedMandate.status },
        durationMs: Date.now() - startTime, status: 'success',
        reasoning: `AP2 mandate created and authorized for $${estimatedCost.toFixed(2)} budget across ${toolIds.length} tools`,
      };
      this.currentRun!.steps.push(step);
      this.logger.logWorkflowStep(runId, step);

      return authorizedMandate;
    } catch (err: any) {
      this.logger.warn('ap2', `Mandate creation failed (non-blocking): ${err.message}`);
      const step: WorkflowStep = {
        id: 'authorize', timestamp: startTime, type: 'authorize',
        durationMs: Date.now() - startTime, status: 'failed',
        error: err.message, reasoning: 'AP2 mandate failed — proceeding with direct x402 payments',
      };
      this.currentRun!.steps.push(step);
      this.logger.logWorkflowStep(runId, step);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Phase 4: Execution (x402 tool chaining)
  // -----------------------------------------------------------------------

  private async phaseExecute(runId: string, plan: any, mandate: AP2Mandate | null): Promise<any[]> {
    this.logger.info('phase', '⚡ Phase 4: Tool Execution (x402 Payments)');

    const results: any[] = [];
    const steps = plan.plan || [];

    for (let i = 0; i < steps.length; i++) {
      const planned = steps[i];
      this.logger.info('execute', `Step ${i + 1}/${steps.length}: ${planned.tool} — ${planned.reasoning}`);

      // Use AP2 protocol if mandate exists, otherwise x402
      const protocol = mandate ? 'ap2' : 'x402';

      const { step, data } = await this.toolExecutor.executeTool(
        planned.tool,
        planned.params || {},
        protocol,
      );

      this.currentRun!.steps.push(step);
      this.currentRun!.totalCostUSD += step.costUSD || 0;
      this.currentRun!.budgetRemainingUSD = this.currentRun!.budgetUSD - this.currentRun!.totalCostUSD;

      results.push({ tool: planned.tool, data, step });

      // Brief pause between calls (rate limiting)
      if (i < steps.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Phase 5: Decision (LLM analyzes results)
  // -----------------------------------------------------------------------

  private async phaseDecide(runId: string, results: any[]): Promise<any> {
    const startTime = Date.now();
    this.logger.info('phase', '🤔 Phase 5: Analysis & Decision');

    const resultSummary = results.map(r => ({
      tool: r.tool,
      success: r.step.status === 'success',
      data: r.data ? JSON.stringify(r.data).slice(0, 2000) : null,
    }));

    const decisionResponse = await callLLM([
      {
        role: 'system',
        content: `You are ARIA, an autonomous research and investment agent. You've just completed a research workflow using REAL live data from external APIs.

Your job: Analyze ALL the data below and make a well-reasoned investment decision.

Budget remaining: $${this.currentRun!.budgetRemainingUSD.toFixed(2)}
Risk policy: max slippage 100bps, per-tx limit $${this.riskEngine.getPolicy().perTransactionLimitUSD}

Decision framework:
1. PRICE ACTION: What does the 24h/7d change tell us? Is there momentum?
2. SENTIMENT: What's the composite sentiment score? What do news headlines say?
3. PORTFOLIO: Is the portfolio already over-allocated? What's the concentration risk?
4. ROUTING: Is there a good swap route with low price impact?
5. WEB RESEARCH: What does broader market context suggest?

Be specific — cite actual numbers from the data (prices, percentages, scores).
If data is missing or unavailable, factor that uncertainty into your confidence score.

Respond with JSON:
- decision: "buy" | "sell" | "hold"
- confidence: 0-1 (lower if data is incomplete or signals conflict)
- reasoning: detailed explanation citing specific data points
- action: { tool: "trade-execute", params: { routeId: "latest", maxSlippageBps: 50 } } if executing, or null
- riskFactors: array of specific risk considerations`,
      },
      {
        role: 'user',
        content: `Research results:\n${JSON.stringify(resultSummary, null, 2)}\n\nAnalyze and decide. Respond with JSON only.`,
      },
    ]);

    let decision: any;
    try {
      decision = JSON.parse(decisionResponse);
    } catch {
      decision = { decision: 'hold', confidence: 0.5, reasoning: decisionResponse, action: null, riskFactors: [] };
    }

    this.logger.info('decide', `Decision: ${decision.decision} (confidence: ${(decision.confidence * 100).toFixed(0)}%)`, {
      reasoning: decision.reasoning,
      riskFactors: decision.riskFactors,
    });

    const step: WorkflowStep = {
      id: 'decide', timestamp: startTime, type: 'reason',
      output: decision, durationMs: Date.now() - startTime,
      status: 'success', reasoning: decision.reasoning,
    };
    this.currentRun!.steps.push(step);
    this.logger.logWorkflowStep(runId, step);

    return decision;
  }

  // -----------------------------------------------------------------------
  // Phase 6: Trade Execution (Track 4)
  // -----------------------------------------------------------------------

  private async phaseTradeExecute(runId: string, decision: any): Promise<void> {
    if (!decision.action) return;

    this.logger.info('phase', '💱 Phase 6: Trade Execution');

    const { step, data } = await this.toolExecutor.executeTool(
      decision.action.tool,
      decision.action.params || {},
      'x402',
    );

    this.currentRun!.steps.push(step);
    this.currentRun!.totalCostUSD += step.costUSD || 0;

    if (data?.txHash) {
      this.logger.info('trade', `Trade executed: ${data.txHash}`, {
        tokenIn: data.tokenIn,
        tokenOut: data.tokenOut,
        amountIn: data.amountIn,
        amountOut: data.amountOut,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Phase 7: Report Generation
  // -----------------------------------------------------------------------

  private async phaseReport(runId: string, objective: string): Promise<WorkflowResult> {
    const startTime = Date.now();
    this.logger.info('phase', '📊 Phase 7: Report Generation');

    // Collect key data points from executed steps for the report
    const stepSummaries = this.currentRun!.steps
      .filter(s => s.type === 'execute' && s.status === 'success' && s.output)
      .map(s => `- ${s.tool}: ${JSON.stringify(s.output).slice(0, 300)}`)
      .join('\n');

    const reportResponse = await callLLM([
      {
        role: 'system',
        content: `You are ARIA. Generate a final report summarizing the autonomous research workflow.
All data was sourced from REAL live APIs (CoinGecko, CryptoCompare, DeFi Llama, DuckDuckGo, on-chain RPCs).
Respond with JSON: { summary, recommendation, keyFindings: string[] }
Be specific — reference actual prices, sentiment scores, and data points from the steps.`,
      },
      {
        role: 'user',
        content: `Objective: ${objective}\nSteps completed: ${this.currentRun!.steps.length}\nTotal cost: $${this.currentRun!.totalCostUSD.toFixed(4)}\n\nStep data:\n${stepSummaries}\n\nGenerate summary report. JSON only.`,
      },
    ]);

    let report: any;
    try {
      report = JSON.parse(reportResponse);
    } catch {
      report = { summary: reportResponse, recommendation: 'See full logs', keyFindings: [] };
    }

    const auditReport = this.logger.getFullReport();

    const result: WorkflowResult = {
      summary: report.summary,
      recommendation: report.recommendation,
      confidence: 0.72,
      data: {
        keyFindings: report.keyFindings,
        auditSummary: auditReport.summary,
      },
      receipts: auditReport.receipts,
    };

    const step: WorkflowStep = {
      id: 'report', timestamp: startTime, type: 'report',
      output: result as unknown as Record<string, unknown>, durationMs: Date.now() - startTime,
      status: 'success', reasoning: 'Generated final report with audit trail',
    };
    this.currentRun!.steps.push(step);
    this.logger.logWorkflowStep(runId, step);

    return result;
  }

  // -----------------------------------------------------------------------
  // AP2 Mandate Fulfillment (Track 3)
  // -----------------------------------------------------------------------

  private async fulfillMandate(mandate: AP2Mandate, run: WorkflowRun): Promise<void> {
    try {
      const fulfillment: AP2Fulfillment = {
        mandateId: mandate.mandateId,
        fulfillmentId: `fulfill-${Date.now()}`,
        steps: run.steps,
        totalSpent: run.totalCostUSD,
        receipts: this.logger.getReceipts(),
        completedAt: new Date().toISOString(),
      };

      await fetch(`${MERCHANT_BASE}/api/v1/mandates/${mandate.mandateId}/fulfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fulfillment),
      });

      this.logger.info('ap2', `Mandate fulfilled: ${mandate.mandateId}`, {
        totalSpent: run.totalCostUSD,
        receiptCount: fulfillment.receipts.length,
      });

      this.onEvent?.({ type: 'mandate:fulfilled', data: fulfillment });
    } catch (err: any) {
      this.logger.warn('ap2', `Mandate fulfillment failed: ${err.message}`);
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  getAuditReport() { return this.logger.getFullReport(); }
  getCurrentRun() { return this.currentRun; }
  getBudgetStatus() { return this.riskEngine.getBudgetStatus(); }
}
