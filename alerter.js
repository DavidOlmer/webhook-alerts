/**
 * Webhook Alerter for Slack/Discord
 * REBAA-8 - Rebel AI Ventures
 * 
 * Sends formatted alerts to Slack and Discord webhooks.
 * Supports: agent errors, issue status changes, budget warnings.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load config from file or use defaults
let config = {
  webhooks: {
    slack: process.env.SLACK_WEBHOOK_URL || null,
    discord: process.env.DISCORD_WEBHOOK_URL || null
  },
  defaults: {
    timeout: 10000,
    retries: 2
  }
};

// Try to load config.json
const configPath = process.env.WEBHOOK_CONFIG_PATH || path.join(__dirname, 'config.json');
try {
  if (fs.existsSync(configPath)) {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...fileConfig };
  }
} catch (err) {
  console.warn(`[Alerter] Could not load config from ${configPath}:`, err.message);
}

// Alert types with their templates
const ALERT_TYPES = {
  AGENT_ERROR: 'agent_error',
  ISSUE_STATUS_CHANGE: 'issue_status_change',
  BUDGET_WARNING: 'budget_warning'
};

/**
 * Format message for Slack
 */
function formatSlackMessage(type, data) {
  const templates = {
    [ALERT_TYPES.AGENT_ERROR]: {
      attachments: [{
        color: '#ff0000',
        pretext: '🚨 *Agent Error*',
        fields: [
          { title: 'Agent', value: data.agent || 'Unknown', short: true },
          { title: 'Severity', value: data.severity || 'error', short: true },
          { title: 'Error', value: `\`\`\`${data.error || 'No details'}\`\`\``, short: false },
          { title: 'Timestamp', value: data.timestamp || new Date().toISOString(), short: true }
        ],
        footer: 'Rebel AI Alerter'
      }]
    },
    [ALERT_TYPES.ISSUE_STATUS_CHANGE]: {
      attachments: [{
        color: '#36a64f',
        pretext: '📋 *Issue Status Changed*',
        fields: [
          { title: 'Issue', value: data.issueId || 'Unknown', short: true },
          { title: 'Title', value: data.title || 'Untitled', short: true },
          { title: 'Status', value: `${data.oldStatus || '?'} → *${data.newStatus || '?'}*`, short: false },
          { title: 'Changed By', value: data.changedBy || 'System', short: true }
        ],
        footer: 'Rebel AI Alerter'
      }]
    },
    [ALERT_TYPES.BUDGET_WARNING]: {
      attachments: [{
        color: '#ffcc00',
        pretext: '💰 *Budget Warning*',
        fields: [
          { title: 'Project', value: data.project || 'Unknown', short: true },
          { title: 'Threshold', value: `${data.threshold || 80}%`, short: true },
          { title: 'Current Usage', value: `${data.currentUsage || 0}%`, short: true },
          { title: 'Budget', value: data.budget || 'N/A', short: true },
          { title: 'Message', value: data.message || 'Budget threshold exceeded', short: false }
        ],
        footer: 'Rebel AI Alerter'
      }]
    }
  };

  return templates[type] || { text: `Unknown alert type: ${type}\n${JSON.stringify(data)}` };
}

/**
 * Format message for Discord
 */
function formatDiscordMessage(type, data) {
  const colors = {
    [ALERT_TYPES.AGENT_ERROR]: 0xff0000,      // Red
    [ALERT_TYPES.ISSUE_STATUS_CHANGE]: 0x36a64f, // Green
    [ALERT_TYPES.BUDGET_WARNING]: 0xffcc00    // Yellow
  };

  const templates = {
    [ALERT_TYPES.AGENT_ERROR]: {
      embeds: [{
        title: '🚨 Agent Error',
        color: colors[type],
        fields: [
          { name: 'Agent', value: data.agent || 'Unknown', inline: true },
          { name: 'Severity', value: data.severity || 'error', inline: true },
          { name: 'Error', value: `\`\`\`${(data.error || 'No details').slice(0, 1000)}\`\`\``, inline: false },
          { name: 'Timestamp', value: data.timestamp || new Date().toISOString(), inline: true }
        ],
        footer: { text: 'Rebel AI Alerter' }
      }]
    },
    [ALERT_TYPES.ISSUE_STATUS_CHANGE]: {
      embeds: [{
        title: '📋 Issue Status Changed',
        color: colors[type],
        fields: [
          { name: 'Issue', value: data.issueId || 'Unknown', inline: true },
          { name: 'Title', value: data.title || 'Untitled', inline: true },
          { name: 'Status', value: `${data.oldStatus || '?'} → **${data.newStatus || '?'}**`, inline: false },
          { name: 'Changed By', value: data.changedBy || 'System', inline: true }
        ],
        footer: { text: 'Rebel AI Alerter' }
      }]
    },
    [ALERT_TYPES.BUDGET_WARNING]: {
      embeds: [{
        title: '💰 Budget Warning',
        color: colors[type],
        fields: [
          { name: 'Project', value: data.project || 'Unknown', inline: true },
          { name: 'Threshold', value: `${data.threshold || 80}%`, inline: true },
          { name: 'Current Usage', value: `${data.currentUsage || 0}%`, inline: true },
          { name: 'Budget', value: data.budget || 'N/A', inline: true },
          { name: 'Message', value: data.message || 'Budget threshold exceeded', inline: false }
        ],
        footer: { text: 'Rebel AI Alerter' }
      }]
    }
  };

  return templates[type] || { content: `Unknown alert type: ${type}\n${JSON.stringify(data)}` };
}

/**
 * Send HTTP POST request
 */
function sendRequest(url, payload, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const body = JSON.stringify(payload);
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: options.timeout || config.defaults.timeout
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Send with retries
 */
async function sendWithRetry(url, payload, options = {}) {
  const maxRetries = options.retries ?? config.defaults.retries;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await sendRequest(url, payload, options);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Main Alerter class
 */
class Alerter {
  constructor(options = {}) {
    this.slackUrl = options.slackUrl || config.webhooks.slack;
    this.discordUrl = options.discordUrl || config.webhooks.discord;
    this.options = {
      timeout: options.timeout || config.defaults.timeout,
      retries: options.retries ?? config.defaults.retries
    };
  }

  /**
   * Send alert to all configured webhooks
   */
  async send(type, data) {
    const results = { slack: null, discord: null, errors: [] };

    if (this.slackUrl) {
      try {
        const payload = formatSlackMessage(type, data);
        results.slack = await sendWithRetry(this.slackUrl, payload, this.options);
      } catch (err) {
        results.errors.push({ target: 'slack', error: err.message });
      }
    }

    if (this.discordUrl) {
      try {
        const payload = formatDiscordMessage(type, data);
        results.discord = await sendWithRetry(this.discordUrl, payload, this.options);
      } catch (err) {
        results.errors.push({ target: 'discord', error: err.message });
      }
    }

    if (!this.slackUrl && !this.discordUrl) {
      results.errors.push({ target: 'all', error: 'No webhook URLs configured' });
    }

    return results;
  }

  /**
   * Send to Slack only
   */
  async sendToSlack(type, data) {
    if (!this.slackUrl) throw new Error('Slack webhook URL not configured');
    const payload = formatSlackMessage(type, data);
    return sendWithRetry(this.slackUrl, payload, this.options);
  }

  /**
   * Send to Discord only
   */
  async sendToDiscord(type, data) {
    if (!this.discordUrl) throw new Error('Discord webhook URL not configured');
    const payload = formatDiscordMessage(type, data);
    return sendWithRetry(this.discordUrl, payload, this.options);
  }

  // Convenience methods
  async agentError(data) {
    return this.send(ALERT_TYPES.AGENT_ERROR, data);
  }

  async issueStatusChange(data) {
    return this.send(ALERT_TYPES.ISSUE_STATUS_CHANGE, data);
  }

  async budgetWarning(data) {
    return this.send(ALERT_TYPES.BUDGET_WARNING, data);
  }
}

// Export
module.exports = {
  Alerter,
  ALERT_TYPES,
  formatSlackMessage,
  formatDiscordMessage
};
