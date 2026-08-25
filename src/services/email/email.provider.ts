// ============================================================================
// Email Provider — Abstraction Layer for Provider-Specific Logic
// ============================================================================
//
// This module defines the EmailProvider interface and provides concrete
// implementations. The goal is to allow swapping providers (Microsoft 365,
// Resend, SMTP, console) without changing any business logic in the email
// service. Business logic only ever talks to EmailService — it never knows
// which provider is underneath.
//
// How to add a new provider:
//   1. Implement the EmailProvider interface (see providers/console.provider.ts)
//   2. Register it in the provider map below
//   3. Set EMAIL_PROVIDER env var to your provider name
//
// Current providers:
//   - console (default in development): logs emails, never contacts a service
//   - resend  : uses the singleton Resend API client (legacy production path)
//   - microsoft-smtp : Microsoft 365 SMTP + OAuth 2.0 (XOAUTH2) via Nodemailer
//                      (production path; requires Exchange Online authorization)
//   - microsoft : deprecated alias for microsoft-smtp — kept for backward
//                 compatibility with configs that still use EMAIL_PROVIDER=microsoft
//
// Provider selection (EMAIL_PROVIDER):
//   EMAIL_PROVIDER=console         → console provider (development default)
//   EMAIL_PROVIDER=resend          → Resend provider (requires RESEND_API_KEY)
//   EMAIL_PROVIDER=microsoft-smtp  → Microsoft 365 SMTP provider (requires MICROSOFT_* vars)
//   EMAIL_PROVIDER=microsoft       → deprecated alias → Microsoft 365 SMTP provider
//   unset                          → resend if RESEND_API_KEY is present, else console
// ============================================================================

import type { EmailProvider, SendEmailParams, SendEmailResult } from './email.types'
import { getTransporter, isTransporterReady } from './email.transporter'
import { EMAIL_LOG_PREFIX, EMAIL_ENV_KEYS, RESEND_ENV_KEYS } from './email.constants'
import { consoleProvider } from './providers/console.provider'
import { microsoftSmtpProvider } from './providers/microsoft-smtp.provider'
import { microsoftProvider } from './providers/microsoft.provider'

/**
 * Strip HTML tags to generate a plain text fallback.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── Resend Provider (Legacy Production Path) ──────────────────────────────

/**
 * Resend API email provider using the singleton Resend client.
 */
const resendProvider: EmailProvider = {
  name: 'resend',

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const client = getTransporter()

    if (!client) {
      console.warn(`${EMAIL_LOG_PREFIX} Resend client not initialized (RESEND_API_KEY missing?). Logging email instead:`)
      console.log(`${EMAIL_LOG_PREFIX} [LOG] To: ${Array.isArray(params.to) ? params.to.join(', ') : params.to} | Subject: ${params.subject}`)
      console.log(`${EMAIL_LOG_PREFIX} [LOG] Body preview: ${params.html.substring(0, 200)}...`)
      return { success: true, messageId: 'logged-mode' }
    }

    try {
      const { data, error } = await client.emails.send({
        from: params.from,
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        subject: params.subject,
        html: params.html,
        text: params.text || stripHtml(params.html),
        replyTo: params.replyTo,
        attachments: params.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          path: a.path,
          contentType: a.contentType,
          contentId: a.cid,
        })),
      })

      if (error) {
        // Never expose Resend error details (or API keys) to the caller —
        // log server-side only and return a generic error.
        console.error(`${EMAIL_LOG_PREFIX} Resend send failed:`, error.message)
        return {
          success: false,
          error: 'Failed to send email',
        }
      }

      const messageId = data?.id || 'unknown'
      console.log(`${EMAIL_LOG_PREFIX} Sent: ${messageId} to ${Array.isArray(params.to) ? params.to.join(', ') : params.to}`)
      return { success: true, messageId }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown Resend error')
      console.error(`${EMAIL_LOG_PREFIX} Resend send failed:`, error.message)

      // Never expose Resend error details to the caller — only return a generic error
      return {
        success: false,
        error: 'Failed to send email',
      }
    }
  },

  async verifyConnection(): Promise<boolean> {
    return isTransporterReady()
  },
}

// ─── Provider Registry ──────────────────────────────────────────────────────

const providers: Record<string, EmailProvider> = {
  console: consoleProvider,
  resend: resendProvider,
  'microsoft-smtp': microsoftSmtpProvider,
  // Deprecated alias — kept so EMAIL_PROVIDER=microsoft still resolves.
  microsoft: microsoftProvider,
}

/**
 * Resolve the configured provider name from the environment.
 *
 * EMAIL_PROVIDER is canonical; PROVIDER_TYPE is honoured as a legacy alias.
 * When neither is set, defaults to 'resend' only if a RESEND_API_KEY exists,
 * otherwise to 'console' so development runs never depend on credentials.
 */
export function resolveProviderName(): string {
  const explicit = (process.env[EMAIL_ENV_KEYS.PROVIDER] || process.env[EMAIL_ENV_KEYS.LEGACY_PROVIDER] || '').trim().toLowerCase()
  if (explicit) return explicit
  return process.env[RESEND_ENV_KEYS.API_KEY] ? 'resend' : 'console'
}

/**
 * Get the active email provider.
 * Unknown provider names fall back to the console provider (safe default).
 */
export function getProvider(): EmailProvider {
  const providerName = resolveProviderName()
  const provider = providers[providerName]

  if (!provider) {
    console.warn(`${EMAIL_LOG_PREFIX} Unknown provider type '${providerName}'. Falling back to 'console'.`)
    return providers.console
  }

  if (providerName === 'microsoft') {
    console.warn(`${EMAIL_LOG_PREFIX} EMAIL_PROVIDER=microsoft is deprecated — use EMAIL_PROVIDER=microsoft-smtp.`)
  }

  return provider
}

/**
 * Get the name of the active provider (for startup logging / diagnostics).
 */
export function getActiveProviderName(): string {
  const providerName = resolveProviderName()
  return providers[providerName] ? providerName : 'console'
}

/**
 * Register a custom provider (useful for testing or custom integrations).
 */
export function registerProvider(name: string, provider: EmailProvider): void {
  providers[name] = provider
}

/**
 * Get a list of all registered providers.
 */
export function listProviders(): string[] {
  return Object.keys(providers)
}
