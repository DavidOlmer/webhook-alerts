#!/usr/bin/env node
/**
 * Test script for Webhook Alerter
 * 
 * Usage:
 *   node test.js                    # Dry run (no actual sends)
 *   node test.js --live             # Send to configured webhooks
 *   SLACK_WEBHOOK_URL=... node test.js --live
 */

const { Alerter, ALERT_TYPES, formatSlackMessage, formatDiscordMessage } = require('./alerter');

const testData = {
  agentError: {
    agent: 'AutoBot-REBAA8',
    severity: 'critical',
    error: 'Connection timeout after 30s\n  at Agent.run (agent.js:142)\n  at async main (index.js:58)',
    timestamp: new Date().toISOString()
  },
  issueStatusChange: {
    issueId: 'REBAA-42',
    title: 'Implement OAuth2 flow',
    oldStatus: 'In Progress',
    newStatus: 'Review',
    changedBy: 'Rebelclaw'
  },
  budgetWarning: {
    project: 'Rebel AI Core',
    threshold: 80,
    currentUsage: 87,
    budget: '$500/month',
    message: 'API costs approaching monthly limit'
  }
};

async function runTests() {
  const isLive = process.argv.includes('--live');
  
  console.log('='.repeat(60));
  console.log('Webhook Alerter Test Suite');
  console.log(`Mode: ${isLive ? '🔴 LIVE (sending real webhooks)' : '🟢 DRY RUN (formatting only)'}`);
  console.log('='.repeat(60));
  console.log();

  // Test 1: Message formatting
  console.log('📝 TEST 1: Message Formatting\n');
  
  for (const [typeName, type] of Object.entries(ALERT_TYPES)) {
    const dataKey = typeName.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const data = testData[dataKey] || testData.agentError;
    
    console.log(`--- ${typeName} ---`);
    console.log('Slack payload:');
    console.log(JSON.stringify(formatSlackMessage(type, data), null, 2));
    console.log('\nDiscord payload:');
    console.log(JSON.stringify(formatDiscordMessage(type, data), null, 2));
    console.log();
  }

  // Test 2: Alerter instantiation
  console.log('📝 TEST 2: Alerter Instantiation\n');
  
  const alerter = new Alerter();
  console.log('Default Alerter created');
  console.log(`  Slack URL: ${alerter.slackUrl ? '✅ configured' : '❌ not set'}`);
  console.log(`  Discord URL: ${alerter.discordUrl ? '✅ configured' : '❌ not set'}`);
  console.log();

  const customAlerter = new Alerter({
    slackUrl: 'https://hooks.slack.com/test',
    discordUrl: 'https://discord.com/api/webhooks/test',
    timeout: 5000,
    retries: 1
  });
  console.log('Custom Alerter created with explicit URLs');
  console.log(`  Timeout: ${customAlerter.options.timeout}ms`);
  console.log(`  Retries: ${customAlerter.options.retries}`);
  console.log();

  // Test 3: Live sending (if --live flag)
  if (isLive) {
    console.log('📝 TEST 3: Live Webhook Delivery\n');
    
    if (!alerter.slackUrl && !alerter.discordUrl) {
      console.log('⚠️  No webhook URLs configured. Set SLACK_WEBHOOK_URL or DISCORD_WEBHOOK_URL');
      console.log('   Example: SLACK_WEBHOOK_URL=https://hooks.slack.com/... node test.js --live');
      return;
    }

    try {
      console.log('Sending agent error alert...');
      const result1 = await alerter.agentError(testData.agentError);
      console.log('Result:', JSON.stringify(result1, null, 2));
      
      console.log('\nSending issue status change alert...');
      const result2 = await alerter.issueStatusChange(testData.issueStatusChange);
      console.log('Result:', JSON.stringify(result2, null, 2));
      
      console.log('\nSending budget warning alert...');
      const result3 = await alerter.budgetWarning(testData.budgetWarning);
      console.log('Result:', JSON.stringify(result3, null, 2));
      
      console.log('\n✅ All alerts sent successfully!');
    } catch (err) {
      console.error('❌ Error sending alerts:', err.message);
    }
  } else {
    console.log('📝 TEST 3: Skipped (use --live to send real webhooks)\n');
  }

  console.log('='.repeat(60));
  console.log('Tests complete');
  console.log('='.repeat(60));
}

runTests().catch(console.error);
