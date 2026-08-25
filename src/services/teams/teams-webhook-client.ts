// ============================================================================
// Teams Webhook Client — Webhook Transport Layer
// ============================================================================
// Provides a webhook-based transport for sending Teams notifications via
// Power Automate Workflow Webhooks, replacing the Microsoft Graph API.
// ============================================================================

import https from 'https'
import { URL } from 'url'
import {
  TEAMS_WEBHOOK_PREFIX,
  TEAMS_WEBHOOK as WEBHOOK_CONFIG,
  MOCK_WEBHOOK,
} from './teams.constants'
import { teamsMonitor } from './teams-monitor'
import type { TeamsConfig, TeamsSendResult, TeamsMention } from './teams.types'

// ─── Configuration Loader ───────────────────────────────────────────────────

export function loadTeamsConfig(): TeamsConfig {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL
  const enabled = !!webhookUrl
  return { webhookUrl, enabled, mockMode: !enabled }
}

// ─── Message Sending (Real) ─────────────────────────────────────────────────

export async function sendWebhookMessage(
  config: TeamsConfig,
  _teamId: string,
  _channelId: string,
  cardJson: Record<string, unknown>,
  mention?: TeamsMention | null,
): Promise<TeamsSendResult> {
  const startTime = Date.now()

  if (!config.enabled || !config.webhookUrl) {
    console.log(TEAMS_WEBHOOK_PREFIX + ' Webhook not configured - message not sent.')
    teamsMonitor.recordMessageSend(false, undefined, Date.now() - startTime)
    return { success: false, message: 'Webhook not configured', error: 'No webhook URL' }
  }

  const webhookPayload: Record<string, unknown> = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: cardJson,
      },
    ],
  }

  // Attach the recipient mention at the payload root so Teams renders a
  // highlighted mention pill (the supported popup/banner mechanism for webhook
  // messages). Never uses @everyone or @channel.
  if (mention && mention.name && mention.id) {
    webhookPayload.msteams = {
      entities: [
        {
          type: 'mention',
          text: '<at>' + mention.name + '</at>',
          mentioned: { id: mention.id, name: mention.name },
        },
      ],
    }
    console.log(TEAMS_WEBHOOK_PREFIX + ' Mentioning: ' + mention.name + ' <' + mention.id + '>')
  }

  const payloadStr = JSON.stringify(webhookPayload)
  console.log(TEAMS_WEBHOOK_PREFIX + ' POSTing to webhook URL')

  try {
    const { statusCode, body } = await httpsPost(
      config.webhookUrl,
      payloadStr,
      { 'Content-Type': 'application/json' },
    )

    const duration = Date.now() - startTime

    if (statusCode >= 200 && statusCode < 300) {
      teamsMonitor.recordMessageSend(true, undefined, duration)
      console.log(TEAMS_WEBHOOK_PREFIX + ' Webhook delivered successfully (' + duration + 'ms, status: ' + statusCode + ')')

      return {
        success: true,
        message: 'Webhook delivered (' + duration + 'ms)',
        messageId: 'webhook_' + Date.now().toString(36),
        statusCode,
        responseBody: body ? body.substring(0, WEBHOOK_CONFIG.MAX_RESPONSE_BODY_CHARS) : undefined,
        durationMs: duration,
      }
    }

    let errorMessage: string
    try {
      const parsed = JSON.parse(body)
      errorMessage = parsed.message || parsed.error?.message || body.substring(0, 500)
    } catch {
      errorMessage = body ? body.substring(0, 500) : 'Empty response body'
    }

    console.error(TEAMS_WEBHOOK_PREFIX + ' Webhook request failed (status: ' + statusCode + '): ' + errorMessage)
    teamsMonitor.recordMessageSend(false, undefined, duration)

    return {
      success: false,
      message: 'Webhook returned status ' + statusCode,
      error: errorMessage,
      statusCode,
      responseBody: body ? body.substring(0, WEBHOOK_CONFIG.MAX_RESPONSE_BODY_CHARS) : undefined,
      durationMs: duration,
    }
  } catch (err) {
    const duration = Date.now() - startTime
    const error = err instanceof Error ? err : new Error('Unknown error')
    console.error(TEAMS_WEBHOOK_PREFIX + ' HTTP request failed: ' + error.message)
    teamsMonitor.recordMessageSend(false, undefined, duration)
    return { success: false, message: 'HTTP request failed', error: error.message, statusCode: 0, durationMs: duration }
  }
}

// ─── Message Sending (Mock) ─────────────────────────────────────────────────

export async function sendWebhookMessageMock(
  config: TeamsConfig,
  _teamId: string,
  _channelId: string,
  cardJson: Record<string, unknown>,
  mention?: TeamsMention | null,
): Promise<boolean> {
  const startTime = Date.now()
  const latency = MOCK_WEBHOOK.MIN_LATENCY_MS + Math.random() * (MOCK_WEBHOOK.MAX_LATENCY_MS - MOCK_WEBHOOK.MIN_LATENCY_MS)
  await sleep(latency)

  console.log('')
  console.log('='.repeat(60))
  console.log('Teams Notification (MOCK MODE - Webhook)')
  console.log('='.repeat(60))
  console.log('Event:    ' + (cardJson.title || 'Unknown'))
  if (mention && mention.name) {
    console.log('Mention:  @' + mention.name + ' <' + mention.id + '>')
  }
  console.log('Webhook:  ' + (config.webhookUrl || 'Not configured'))
  console.log('Card:     ' + (cardJson.type || 'unknown') + ' v' + (cardJson.version || '1.0'))
  if (cardJson.body && Array.isArray(cardJson.body)) {
    for (const block of cardJson.body as Array<Record<string, unknown>>) {
      if (block.type === 'TextBlock') {
        console.log('  Text:   ' + String(block.text || '').substring(0, 100))
      }
      if (block.type === 'FactSet' && block.facts && Array.isArray(block.facts)) {
        for (const fact of block.facts as Array<{ title: string; value: string }>) {
          console.log('  ' + fact.title + ': ' + fact.value)
        }
      }
    }
  }
  if (cardJson.actions && Array.isArray(cardJson.actions)) {
    for (const action of cardJson.actions as Array<Record<string, unknown>>) {
      console.log('Action:   ' + (action.title || '') + ' -> ' + (action.url || 'N/A'))
    }
  }
  console.log('Latency:  ' + Math.round(latency) + 'ms (simulated)')
  console.log('Status:   Delivered (mock)')
  console.log('='.repeat(60))
  console.log('')

  const duration = Date.now() - startTime
  teamsMonitor.recordMessageSend(true, undefined, duration)
  return true
}

// ─── Status ─────────────────────────────────────────────────────────────────

export function isWebhookReady(config?: TeamsConfig): boolean {
  const c = config || loadTeamsConfig()
  return c.enabled && !!c.webhookUrl
}

export function getWebhookStatus() {
  const config = loadTeamsConfig()
  return {
    provider: 'microsoft-teams-webhook',
    configured: config.enabled,
    mockMode: !config.enabled,
    ready: isWebhookReady(config),
    webhookConfigured: !!config.webhookUrl,
    webhookUrlPreview: config.webhookUrl ? config.webhookUrl.substring(0, 40) + '...' : undefined,
  }
}

// ─── Internal: HTTP Helper ──────────────────────────────────────────────────

function httpsPost(url: string, body: string, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const parsedUrl = new URL(url)
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      timeout: WEBHOOK_CONFIG.TIMEOUT_MS,
      headers: {
        'Content-Length': Buffer.byteLength(body).toString(),
        ...headers,
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }))
    })
    req.on('error', (err: Error) => reject(err))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out after ' + WEBHOOK_CONFIG.TIMEOUT_MS + 'ms'))
    })
    req.write(body)
    req.end()
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}
