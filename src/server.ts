import 'dotenv/config'

import { createHash } from 'crypto'
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

/**
 * Logs whether BETTER_AUTH_SECRET is configured, its length, and a SHA-256
 * hash PREFIX (12 hex chars — not reversible to the secret) — never the
 * secret itself. Run this same check against the Frontend's own runtime
 * (e.g. via a matching startup log there) and compare the two lines by eye:
 * identical hash prefix + identical length means the two services are
 * signing/verifying session cookies with the same secret. This exists
 * specifically so a secret mismatch between two separately-deployed
 * services (Vercel + Railway) is visible in each service's OWN production
 * logs without either service needing access to the other's environment.
 */
function logAuthConfig() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    console.log('[AuthConfig] secretConfigured=false')
    return
  }
  const hashPrefix = createHash('sha256').update(secret).digest('hex').slice(0, 12)
  console.log(`[AuthConfig] secretConfigured=true secretLength=${secret.length} secretHashPrefix=${hashPrefix}`)
}

async function startServer() {
  logAuthConfig()

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
  '[Support Hero] Backend server running on port ' + PORT
)

    console.log(
      '[Support Hero] Environment: ' +
        (process.env.NODE_ENV || 'development')
    )
  })
}

// ─── Start Server ─────────────────────────────────────────────────────────

startServer().catch(function (err) {
  console.error('[Support Hero] Failed to start server:', err)
  process.exit(1)
})