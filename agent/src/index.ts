/**
 * ARIA Agent Entry Point
 *
 * Starts the autonomous agent, connects to the merchant server,
 * and runs the research & investment workflow.
 */

import 'dotenv/config';
import { AriaAgent } from './aria-agent.js';
import { WebSocket } from 'ws';

const DASHBOARD_WS = process.env.DASHBOARD_WS || 'ws://localhost:4000/ws';

async function main() {
  console.log('\n🤖 ARIA — Autonomous Research & Investment Agent\n');

  // Connect to merchant WebSocket for real-time dashboard updates
  let ws: WebSocket | null = null;
  try {
    ws = new WebSocket(DASHBOARD_WS);
    ws.on('open', () => console.log('📡 Connected to dashboard WebSocket'));
    ws.on('error', () => console.log('⚠️  Dashboard WebSocket not available (non-blocking)'));
  } catch {
    console.log('⚠️  Dashboard WebSocket not available');
  }

  const agent = new AriaAgent({
    onEvent: (event) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(event));
      }
    },
  });

  // Default objective — can be overridden via CLI arg
  const objective = process.argv[2] || 'Research ETH market conditions, analyze sentiment, check portfolio allocation, find the best swap route, and decide whether to increase ETH position with $50 USDC on Base.';
  const budget = parseFloat(process.argv[3] || '1.0');

  console.log(`📋 Objective: ${objective}`);
  console.log(`💰 Budget: $${budget.toFixed(2)}\n`);

  const run = await agent.run(objective, budget);

  // Print final report
  console.log('\n' + '═'.repeat(60));
  console.log('📊 FINAL REPORT');
  console.log('═'.repeat(60));
  console.log(`Status: ${run.status}`);
  console.log(`Steps: ${run.steps.length}`);
  console.log(`Total Cost: $${run.totalCostUSD.toFixed(4)}`);
  console.log(`Budget Remaining: $${run.budgetRemainingUSD.toFixed(4)}`);
  console.log(`Duration: ${((run.completedAt || Date.now()) - run.startedAt)}ms`);

  if (run.result) {
    console.log(`\nSummary: ${run.result.summary}`);
    console.log(`Recommendation: ${run.result.recommendation}`);
  }

  // Print audit trail
  const audit = agent.getAuditReport();
  console.log('\n' + '─'.repeat(60));
  console.log('🧾 AUDIT TRAIL');
  console.log('─'.repeat(60));
  console.log(`Payments: ${audit.summary.totalPayments}`);
  console.log(`Total Spent: $${audit.summary.totalSpentUSD.toFixed(4)}`);
  console.log(`By Protocol:`, audit.summary.spendByProtocol);
  console.log(`By Tool:`, audit.summary.spendByTool);

  console.log('\n📜 Payment Receipts:');
  for (const receipt of audit.receipts) {
    console.log(`  ${receipt.protocol.toUpperCase()} | ${receipt.tool} | $${receipt.amountUSD.toFixed(4)} | ${receipt.status}`);
  }

  console.log('\n✅ Risk Assessments:');
  for (const ra of audit.riskAssessments) {
    const icon = ra.approved ? '✅' : '🚫';
    console.log(`  ${icon} ${ra.action} | $${ra.estimatedCostUSD.toFixed(4)} | ${ra.riskLevel} | ${ra.reason.slice(0, 80)}`);
  }

  ws?.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Agent failed:', err);
  process.exit(1);
});
