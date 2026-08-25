import 'dotenv/config'

import { app } from './app'
import { initTransporter } from './services/email/email.transporter'
import { getActiveProviderName } from './services/email/email.provider'
import { EMAIL_LOG_PREFIX } from './services/email/email.constants'
import { TEAMS_LOG_PREFIX } from './services/teams/teams.constants'
import { startQueuePolling as startEmailQueuePolling } from './services/email/email.queue'
import { startQueuePolling as startTeamsQueuePolling } from './services/teams/teams-queue'
import {
  loadTeamsConfig,
  isWebhookReady,
} from './services/teams/teams-webhook-client'
import { logMicrosoftSmtpStatus } from './services/email/providers/microsoft-smtp.provider'

const PORT = parseInt(process.env.PORT || '4000', 10)

async function startServer() {
  // ─── Initialize Email System ────────────────────────────────────────────

  await initTransporter()

  startEmailQueuePolling()

  const activeEmailProvider = getActiveProviderName()

  console.log(
    EMAIL_LOG_PREFIX + ' Active provider: ' + activeEmailProvider
  )

  if (activeEmailProvider === 'microsoft-smtp') {
    logMicrosoftSmtpStatus()
  }

  console.log(EMAIL_LOG_PREFIX + ' Queue processing started')

  // ─── Teams Webhook Integration ─────────────────────────────────────────

  const teamsConfig = loadTeamsConfig()

  if (teamsConfig.enabled) {
    if (isWebhookReady(teamsConfig)) {
      console.log(
        TEAMS_LOG_PREFIX + ' Webhook configured and ready.'
      )
    } else {
      console.log(
        TEAMS_LOG_PREFIX + ' TEAMS_WEBHOOK_URL is set but invalid.'
      )
    }

    // Start Teams queue polling (handles both real + mock)
    startTeamsQueuePolling()

    console.log(
      TEAMS_LOG_PREFIX + ' Queue processing started'
    )
  } else {
    console.log(
      TEAMS_LOG_PREFIX +
        ' Integration disabled — set TEAMS_WEBHOOK_URL to enable.'
    )

    console.log(
      TEAMS_LOG_PREFIX +
        ' Operating in mock mode — all notifications will be logged to console.'
    )
  }

  // ─── Start HTTP Server ─────────────────────────────────────────────────

  app.listen(PORT, '0.0.0.0', function () {
    console.log(
  '[SupportHub] Backend server running on port ' + PORT
)

    console.log(
      '[SupportHub] Environment: ' +
        (process.env.NODE_ENV || 'development')
    )
  })
}

// ─── Start Server ─────────────────────────────────────────────────────────

startServer().catch(function (err) {
  console.error('[SupportHub] Failed to start server:', err)
  process.exit(1)
})