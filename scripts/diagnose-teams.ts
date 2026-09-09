// ============================================================================
// Microsoft Teams webhook diagnostic (read-only unless SEND_TEST=1)
// ============================================================================
// Reuses the EXISTING teams-webhook-client.ts / adaptive-cards.ts code paths
// used by the real /api/teams/test route — does not duplicate transport logic.
// NEVER logs the webhook URL (it carries an embedded signature = secret).
// ============================================================================
import 'dotenv/config'
import { loadTeamsConfig, sendWebhookMessage } from '../src/services/teams/teams-webhook-client'
import { testMessageCard } from '../src/services/teams/adaptive-cards'
import { getFrontendUrl } from '../src/utils/frontend-url'
import type { TeamsNotificationPayload } from '../src/services/teams/teams.types'

async function main() {
  console.log('=== Microsoft Teams Webhook Diagnostic ===\n')
  console.log('TEAMS_TEST_STARTED')

  const envKeys = ['TEAMS_WEBHOOK_URL', 'TEAMS_DEFAULT_CHANNEL_ID', 'TEAMS_DEFAULT_TEAM_ID'] as const
  for (const k of envKeys) {
    console.log(`${k}: ${process.env[k] ? 'configured' : 'MISSING'}`)
  }
  console.log()

  const config = loadTeamsConfig()
  console.log(`TEAMS_CONFIG_PRESENT: ${config.enabled ? 'YES' : 'NO'}`)
  console.log(`mode: ${config.enabled ? 'live webhook' : 'mock (no webhook URL configured)'}\n`)

  if (!config.enabled) {
    console.log('TEAMS_CONFIG_MISSING — TEAMS_WEBHOOK_URL is not set. Cannot proceed to a real send.')
    return
  }

  if (process.env.SEND_TEST !== '1') {
    console.log('--- send skipped (set SEND_TEST=1 to actually POST one test message to the configured webhook) ---')
    return
  }

  const testPayload: TeamsNotificationPayload = {
    id: 'diag_' + Date.now().toString(36),
    eventType: 'test_message',
    title: 'Teams Integration Diagnostic',
    message: 'This is a one-time diagnostic message sent directly through the existing Teams webhook transport.',
    projectName: 'Diagnostic',
    ticketId: '#DIAG-001',
    priority: 'Low',
    url: getFrontendUrl(),
    color: 'info',
    fields: [
      { label: 'Test Type', value: 'Delivery Diagnostic' },
      { label: 'Environment', value: process.env.NODE_ENV || 'development' },
      { label: 'Timestamp', value: new Date().toISOString() },
    ],
  }
  const card = testMessageCard(testPayload)

  console.log('TEAMS_REQUEST_SENT')
  const result = await sendWebhookMessage(config, '', '', card as unknown as Record<string, unknown>)

  if (result.success) {
    console.log('TEAMS_SUCCESS')
    console.log(`HTTP status: ${result.statusCode}`)
    console.log(`duration: ${result.durationMs}ms`)
    console.log(`transport: teams-webhook-client (Power Automate Workflow Webhook)`)
    console.log('NOTE: a 2xx response means the webhook endpoint ACCEPTED the payload; it does not by itself prove the message rendered in the destination channel — check Teams directly to confirm.')
  } else {
    console.log('TEAMS_REQUEST_FAILED')
    console.log(`HTTP status: ${result.statusCode ?? '(none — request-level failure)'}`)
    console.log(`sanitized error: ${result.error}`)
    console.log(`transport: teams-webhook-client (Power Automate Workflow Webhook)`)
  }
}

main().catch((err) => {
  console.error('Diagnostic script crashed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
