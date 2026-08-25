// ============================================================================
// Microsoft 365 SMTP — Standalone Test Script
// ============================================================================
//
// Tests the Microsoft 365 SMTP provider end-to-end WITHOUT going through the
// application: loads the backend environment, validates configuration, acquires
// an Entra OAuth token, connects to smtp.office365.com:587 (STARTTLS),
// authenticates with XOAUTH2 and sends one test email.
//
// Usage (from Backend/):
//   TEST_EMAIL_TO=you@example.com npm run test:microsoft-smtp
//   # or directly:
//   TEST_EMAIL_TO=you@example.com npx tsx test-microsoft-smtp.ts
//
// The recipient is read from TEST_EMAIL_TO — never hardcode a personal address.
//
// If Exchange Online SMTP authorization is still pending (SMTP.SendAsApp,
// service-principal registration and/or mailbox Send-As authorization not yet
// granted by the Microsoft 365 administrator), the script reports the pending
// state — it NEVER fabricates a successful delivery.
//
// Security: no secrets are printed. The OAuth token and client secret are never
// logged.
// ============================================================================

import dotenv from 'dotenv'
dotenv.config()

import {
  isMicrosoftSmtpConfigured,
  getMicrosoftSmtpAccessToken,
  getMicrosoftSmtpTransporter,
} from './src/services/email/providers/microsoft-smtp.provider'
import { loadSenderConfig, buildFromAddress } from './src/services/email/email.transporter'
import { MICROSOFT_SMTP } from './src/services/email/email.constants'

const TEST_PREFIX = '[Microsoft SMTP Test]'

function fail(message: string): never {
  console.error(`${TEST_PREFIX} ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  console.log(`${TEST_PREFIX} Starting...`)

  // 1. Validate configuration
  if (!isMicrosoftSmtpConfigured()) {
    fail(
      'Microsoft SMTP configuration is incomplete. Set MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID,\n' +
      '  MICROSOFT_CLIENT_SECRET, MICROSOFT_SENDER_EMAIL, MICROSOFT_SMTP_HOST and MICROSOFT_SMTP_PORT.',
    )
  }

  const to = process.env.TEST_EMAIL_TO
  if (!to) {
    fail('TEST_EMAIL_TO is not set — provide a recipient address, e.g. TEST_EMAIL_TO=you@example.com.')
  }

  // 2. Acquire the OAuth token from Microsoft Entra (client credentials)
  console.log('Authenticating with Microsoft Entra...')
  const token = await getMicrosoftSmtpAccessToken()
  console.log('OAuth token acquired.')
  void token // token is intentionally never logged

  // 3. Connect + authenticate (XOAUTH2) — no email is sent during this step
  const host = process.env.MICROSOFT_SMTP_HOST || MICROSOFT_SMTP.DEFAULT_HOST
  const port = parseInt(process.env.MICROSOFT_SMTP_PORT || String(MICROSOFT_SMTP.DEFAULT_PORT), 10)
  console.log(`Connecting to ${host}:${port} (STARTTLS)...`)

  const transport = await getMicrosoftSmtpTransporter()
  await transport.verify()
  console.log('SMTP authentication successful.')

  // 4. Send one test email
  console.log('Sending test email...')
  const config = loadSenderConfig()
  const from = buildFromAddress(config)

  const info = await transport.sendMail({
    from,
    to,
    subject: 'SupportHub Microsoft 365 SMTP Test',
    text: 'This is a test email sent through Microsoft 365 SMTP using OAuth 2.0 (XOAUTH2).',
    html: '<h2>SupportHub Email Test</h2><p>This is a test email sent through Microsoft 365 SMTP with OAuth 2.0.</p>',
  })

  console.log(`SUCCESS: Microsoft 365 SMTP email sent (${info.messageId}).`)
  process.exit(0)
}

// main().catch(err => {
//   const message = err instanceof Error ? err.message : String(err)

//   // If the failure is an SMTP authorization/permission problem, report the
//   // pending-administrator state instead of a generic failure. Never print the
//   // OAuth token or client secret — the raw message is safe (SMTP codes only).
//   if (/5\.7\.3|5\.7\.8|5\.7\.139|5\.7\.1|5\.7\.64|535|550|EAUTH|smtp auth|sendas|send as/i.test(message)) {
//     console.error('Microsoft SMTP authentication could not be completed.')
//     console.error('The code is configured, but Exchange Online SMTP authorization is still pending.')
//     console.error('The Microsoft 365 administrator must:')
//     console.error('  1. Grant the existing Entra application the Exchange Online SMTP.SendAsApp permission')
//     console.error('  2. Complete admin consent for the application permission')
//     console.error('  3. Register the application service principal in Exchange Online')
//     console.error('  4. Authorize the application to send as MICROSOFT_SENDER_EMAIL')
//     console.error('  5. Verify SMTP AUTH is enabled for the mailbox/tenant')
//   } else {
//     console.error(`FAILED: Microsoft 365 SMTP test. ${message}`)
//   }

//   process.exit(1)
// })
main().catch(err => {
  const error = err as any

  console.error('')
  console.error('==============================================')
  console.error('[Microsoft SMTP Test] ACTUAL ERROR')
  console.error('==============================================')
  console.error('Name:', error?.name || 'N/A')
  console.error('Message:', error?.message || String(err))
  console.error('Code:', error?.code || 'N/A')
  console.error('Response Code:', error?.responseCode || 'N/A')
  console.error('Response:', error?.response || 'N/A')
  console.error('Command:', error?.command || 'N/A')
  console.error('==============================================')

  process.exit(1)
})