// ============================================================================
// Console Email Provider — Development / Local Delivery
// ============================================================================
//
// Active when EMAIL_PROVIDER=console (the development default).
//
// This provider NEVER contacts Microsoft, Resend, SMTP, or any external email
// service. It logs a safe representation of the email to the server console so
// developers can verify that the correct email is being generated without
// actually sending it.
//
// Security rules enforced here:
//   1. The HTML/text body is NEVER logged (it may contain plaintext initial
//      passwords in login_credentials emails).
//   2. Sensitive query-string values (token, code, key, secret, password, …)
//      are redacted from the subject and from any action URL that is logged.
//   3. For password-reset emails a safe representation of the reset URL is
//      logged with the token redacted — never the raw token.
// ============================================================================

import type { EmailProvider, SendEmailParams, SendEmailResult } from '../email.types'
import { EMAIL_LOG_PREFIX } from '../email.constants'

/**
 * Query-string parameter names whose values are secrets and must never appear
 * in logs. Matched case-insensitively.
 */
const SENSITIVE_PARAM_NAMES = [
  'token',
  'code',
  'key',
  'secret',
  'password',
  'passwd',
  'auth',
  'credential',
  'signature',
  'otp',
]

const SENSITIVE_PARAM_PATTERN = new RegExp(
  `([?&](?:${SENSITIVE_PARAM_NAMES.join('|')})=)[^&#"'\\s<>]*`,
  'gi',
)

/**
 * Replace sensitive query-string values with [REDACTED].
 * Defense in depth — applied to every value the console provider prints.
 */
export function redactSecrets(value: string): string {
  if (!value) return value
  return value.replace(SENSITIVE_PARAM_PATTERN, '$1[REDACTED]')
}

/**
 * Extract up to `limit` href URLs from an HTML body so the developer can see
 * which action link the email carries. URLs are run through redactSecrets().
 */
function extractActionUrls(html: string, limit = 2): string[] {
  const urls: string[] = []
  const hrefPattern = /href="([^"]+)"/gi
  let match: RegExpExecArray | null
  while ((match = hrefPattern.exec(html)) !== null && urls.length < limit) {
    const url = match[1]
    if (url && !url.startsWith('#') && !url.startsWith('mailto:')) {
      urls.push(redactSecrets(url))
    }
  }
  return urls
}

function formatRecipients(to: string | string[]): string {
  return Array.isArray(to) ? to.join(', ') : to
}

/**
 * Console provider — logs the email instead of delivering it.
 */
export const consoleProvider: EmailProvider = {
  name: 'console',

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const to = formatRecipients(params.to)
    const subject = redactSecrets(params.subject)
    const template = params.eventType || 'general'

    // Body is intentionally NOT logged — it may contain plaintext initial
    // passwords (login_credentials) or other sensitive template data.
    const lines: string[] = [
      'EMAIL',
      `  To:       ${to}`,
      `  Subject:  ${subject}`,
      `  Template: ${template}`,
    ]

    // For password-reset emails, log a safe representation of the reset URL
    // with the token redacted so the developer can verify the link shape.
    const urls = extractActionUrls(params.html)
    for (const url of urls) {
      lines.push(`  Action:   ${url}`)
    }

    console.log(`${EMAIL_LOG_PREFIX}[Console Provider] ${lines.join('\n')}`)
    return { success: true, messageId: `console-${Date.now().toString(36)}` }
  },

  async verifyConnection(): Promise<boolean> {
    // Console provider is always available.
    return true
  },
}
