// ============================================================================
// Microsoft 365 SMTP Email Provider — OAuth 2.0 (XOAUTH2) via Nodemailer
// ============================================================================
//
// Active when EMAIL_PROVIDER=microsoft-smtp.
//
// Delivery architecture:
//
//   Microsoft Entra ID (client credentials grant)
//       ↓ OAuth 2.0 access token (https://outlook.office365.com/.default)
//   Nodemailer SMTP transport (XOAUTH2)
//       ↓
//   smtp.office365.com:587 (STARTTLS)
//       ↓
//   Exchange Online → MICROSOFT_SENDER_EMAIL
//
// The token resource is the Exchange Online SMTP endpoint — NOT Microsoft Graph.
// This provider never calls https://graph.microsoft.com/v1.0/.../sendMail and
// never uses a mailbox password / basic AUTH LOGIN / AUTH PLAIN.
//
// Microsoft 365 authorization (administrator tasks — NOT automated here):
//   1. Existing Entra application ("SMTP Oauth") — reuse, never create a new one.
//   2. Office 365 Exchange Online API → Application permission → SMTP.SendAsApp
//      (keep the existing Graph Mail.Send application permission as a fallback).
//   3. Admin consent for the application permission.
//   4. Exchange Online: register the application service principal and authorize
//      it to send as MICROSOFT_SENDER_EMAIL.
//   5. Ensure SMTP AUTH is enabled for the mailbox/tenant where required.
//
// While that authorization is pending, this provider fails safely: send() and
// verifyConnection() return normalized failures and never throw, so the
// application keeps running. It never fabricates success or fake message IDs.
//
// Security rules:
//   - Tokens, client secrets and authorization headers are never logged.
//   - TLS certificate validation is never disabled (no rejectUnauthorized:false).
//   - Credentials exist only in backend environment variables (no frontend vars).
// ============================================================================

import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { ClientSecretCredential } from '@azure/identity'
import type { AccessToken } from '@azure/identity'
import type { EmailProvider, SendEmailParams, SendEmailResult } from '../email.types'
import {
  MICROSOFT_ENV_KEYS,
  MICROSOFT_SMTP,
  MICROSOFT_SMTP_LOG_PREFIX,
} from '../email.constants'

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Environment keys required before the provider will attempt any delivery.
 * Host/port are included so misconfiguration fails loudly instead of silently
 * connecting somewhere unexpected.
 */
const REQUIRED_ENV_KEYS: string[] = [
  MICROSOFT_ENV_KEYS.TENANT_ID,
  MICROSOFT_ENV_KEYS.CLIENT_ID,
  MICROSOFT_ENV_KEYS.CLIENT_SECRET,
  MICROSOFT_ENV_KEYS.SENDER_EMAIL,
  MICROSOFT_ENV_KEYS.SMTP_HOST,
  MICROSOFT_ENV_KEYS.SMTP_PORT,
]

/**
 * Check whether all Microsoft 365 SMTP environment variables are configured.
 * Credentials are never logged — only whether they are present.
 */
export function isMicrosoftSmtpConfigured(): boolean {
  return REQUIRED_ENV_KEYS.every(key => Boolean(process.env[key]))
}

function getSmtpHost(): string {
  return process.env[MICROSOFT_ENV_KEYS.SMTP_HOST] || MICROSOFT_SMTP.DEFAULT_HOST
}

function getSmtpPort(): number {
  const raw = process.env[MICROSOFT_ENV_KEYS.SMTP_PORT]
  const port = raw ? parseInt(raw, 10) : MICROSOFT_SMTP.DEFAULT_PORT
  return Number.isFinite(port) && port > 0 ? port : MICROSOFT_SMTP.DEFAULT_PORT
}

function getSenderEmail(): string {
  return process.env[MICROSOFT_ENV_KEYS.SENDER_EMAIL] || ''
}

function getMissingEnvKeys(): string[] {
  return REQUIRED_ENV_KEYS.filter(key => !process.env[key])
}

// ─── OAuth 2.0 Token Acquisition (client credentials) ──────────────────────
//
// ClientSecretCredential caches the token internally and only hits the Entra
// token endpoint when the cached token is close to expiry, so repeated calls
// do not generate a fresh token for every email.

let credential: ClientSecretCredential | null = null

function getCredential(): ClientSecretCredential | null {
  const tenantId = process.env[MICROSOFT_ENV_KEYS.TENANT_ID]
  const clientId = process.env[MICROSOFT_ENV_KEYS.CLIENT_ID]
  const clientSecret = process.env[MICROSOFT_ENV_KEYS.CLIENT_SECRET]

  if (!tenantId || !clientId || !clientSecret) {
    return null
  }

  if (!credential) {
    credential = new ClientSecretCredential(tenantId, clientId, clientSecret)
  }
  return credential
}

/**
 * Acquire (or reuse a cached) OAuth 2.0 access token for the Exchange Online
 * SMTP resource using the client-credentials / app-only flow.
 *
 * @throws when credentials are missing or Entra rejects the request.
 */
async function acquireTokenRecord(): Promise<AccessToken> {
  const cred = getCredential()
  if (!cred) {
    throw new Error('Microsoft SMTP credentials are not configured')
  }

  console.log(`${MICROSOFT_SMTP_LOG_PREFIX} Acquiring OAuth token`)
  const token = await cred.getToken(MICROSOFT_SMTP.TOKEN_SCOPE)

  if (!token?.token) {
    throw new Error('Microsoft Entra returned an empty access token')
  }

  console.log(`${MICROSOFT_SMTP_LOG_PREFIX} OAuth token acquired`)
  return token
}

/**
 * Public helper (used by the standalone SMTP test script) — returns the raw
 * access token string. Never log the returned value.
 */
export async function getMicrosoftSmtpAccessToken(): Promise<string> {
  const token = await acquireTokenRecord()
  return token.token
}

// ─── Nodemailer Transport Lifecycle ─────────────────────────────────────────
//
// One reusable transporter is created lazily and reused for every email.
// Token lifecycle (cache, expiry, renewal) is managed by Nodemailer's XOAuth2
// via provisionCallback: it reuses a valid token, and only calls back into
// Entra when a (near-)expired token must be renewed.

let transporter: Transporter | null = null
let transporterSender: string | null = null

/**
 * Create (once) and return the reusable Nodemailer SMTP transport.
 * Port 587 + STARTTLS (secure:false, requireTLS:true) — never port 465/25,
 * never rejectUnauthorized:false.
 */
export async function getMicrosoftSmtpTransporter(): Promise<Transporter> {
  const senderEmail = getSenderEmail()

  if (transporter && transporterSender === senderEmail) {
    return transporter
  }

  if (!isMicrosoftSmtpConfigured()) {
    throw new Error(`Microsoft SMTP is not fully configured — missing: ${getMissingEnvKeys().join(', ')}`)
  }

  const host = getSmtpHost()
  const port = getSmtpPort()

  console.log(`${MICROSOFT_SMTP_LOG_PREFIX} Initializing provider`)
  console.log(`${MICROSOFT_SMTP_LOG_PREFIX} Connecting to ${host}:${port} (STARTTLS)`)

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,   // port 587 — the connection upgrades to TLS via STARTTLS
    requireTLS: true, // force the STARTTLS upgrade; never fall back to plaintext
    // TLS certificate validation is NEVER disabled (rejectUnauthorized stays true).
    auth: {
      type: 'OAuth2',
      user: senderEmail,
      provisionCallback: (
        _user: string,
        _renew: boolean,
        callback: (err: Error | null, accessToken: string, expires: number) => void,
      ) => {
        acquireTokenRecord()
          .then(token => {
            // expires is an absolute ms timestamp (0 = unknown → reuse cached).
            callback(null, token.token, token.expiresOnTimestamp || 0)
          })
          .catch(err => {
            const error = err instanceof Error ? err : new Error('Failed to acquire OAuth token')
            // Nodemailer only replaces the token when err is falsy, so an empty
            // token value on error is safe.
            callback(error, '', 0)
          })
      },
    },
    connectionTimeout: 30_000,
    greetingTimeout: 30_000,
    socketTimeout: 60_000,
  })

  transporterSender = senderEmail
  console.log(`${MICROSOFT_SMTP_LOG_PREFIX} Provider initialized`)
  return transporter
}

/**
 * Drop the cached transport so the next call re-creates it and re-acquires an
 * OAuth token. Used on reconfiguration and after auth-related send failures.
 */
export function resetMicrosoftSmtpTransporter(): void {
  if (transporter) {
    transporter.close()
  }
  transporter = null
  transporterSender = null
}

// ─── Error Classification ───────────────────────────────────────────────────
//
// Errors are classified server-side so diagnostics are useful without ever
// exposing credentials or raw Microsoft/Nodemailer internals to callers.

export type MicrosoftSmtpErrorCategory =
  | 'missing_config'
  | 'oauth_token_failed'
  | 'smtp_auth_failed'
  | 'smtp_auth_disabled'
  | 'smtp_sendas_denied'
  | 'sender_unavailable'
  | 'recipient_rejected'
  | 'tls_failure'
  | 'attachment_failure'
  | 'timeout'
  | 'connection_failed'
  | 'unknown'

const CATEGORY_HINTS: Record<MicrosoftSmtpErrorCategory, string> = {
  missing_config: 'Required MICROSOFT_* environment variables are missing',
  oauth_token_failed: 'Microsoft Entra rejected the client credentials (check tenant ID, client ID and client secret)',
  smtp_auth_failed: 'SMTP authentication failed — the OAuth token was rejected (check SMTP.SendAsApp / service-principal setup)',
  smtp_auth_disabled: 'SMTP AUTH is not enabled for the mailbox or tenant',
  smtp_sendas_denied: 'Sender is not authorized — Send-As / SMTP.SendAsApp permission is missing for the mailbox',
  sender_unavailable: 'Sender mailbox is unavailable or not licensed',
  recipient_rejected: 'Recipient was rejected by the mail server',
  tls_failure: 'TLS handshake with smtp.office365.com failed',
  attachment_failure: 'Email attachment could not be processed',
  timeout: 'SMTP connection or command timed out',
  connection_failed: 'Could not connect to the SMTP server',
  unknown: 'Unknown Microsoft SMTP error',
}

function classifyError(err: unknown): { category: MicrosoftSmtpErrorCategory; message: string } {
  const error = err instanceof Error ? err : new Error(String(err))
  const message = error.message || ''
  const lower = message.toLowerCase()
  const code = (error as { code?: string }).code

  // OAuth token acquisition failures (Entra / AADSTS)
  if (
    code === 'EAUTH' && /token|oauth|aadsts|client secret|client id|tenant/i.test(message) ||
    /invalid_client|invalid_tenant|invalid_grant|aadsts|client_secret|client_id/i.test(lower)
  ) {
    return { category: 'oauth_token_failed', message }
  }

  // SMTP auth disabled for the mailbox/tenant
  if (/5\.7\.139|5\.7\.8|smtp auth (is )?not enabled|auth disabled/i.test(lower)) {
    return { category: 'smtp_auth_disabled', message }
  }

  // SendAs / sender authorization (app-only sending permission missing)
  if (/5\.7\.1|5\.7\.64|sendas|send as|sender denied|not authorized to send|tenant does not allow/i.test(lower)) {
    return { category: 'smtp_sendas_denied', message }
  }

  // Generic SMTP authentication failures (XOAUTH2 rejected, token revoked, …)
  if (code === 'EAUTH' || /535|5\.7\.3|authentication (failed|unsuccessful)|credentials rejected/i.test(lower)) {
    return { category: 'smtp_auth_failed', message }
  }

  // Sender mailbox issues
  if (/5\.2\.1|mailbox unavailable|sender .*unavailable|not licensed/i.test(lower)) {
    return { category: 'sender_unavailable', message }
  }

  // Recipient rejected
  if (/5\.1\.1|5\.1\.10|550|recipient (rejected|not allowed)|user unknown/i.test(lower)) {
    return { category: 'recipient_rejected', message }
  }

  // TLS failures
  if (code === 'ETLS' || /tls|certificate|ssl/i.test(lower)) {
    return { category: 'tls_failure', message }
  }

  // Attachments
  if (/attachment|stream|content type|base64/i.test(lower)) {
    return { category: 'attachment_failure', message }
  }

  // Timeouts
  if (code === 'ETIMEDOUT' || code === 'ESOCKET' || /timed ?out|timeout/i.test(lower)) {
    return { category: 'timeout', message }
  }

  // Connection failures
  if (code === 'ECONNECTION' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || /connection (failed|refused|reset)/i.test(lower)) {
    return { category: 'connection_failed', message }
  }

  return { category: 'unknown', message }
}

/**
 * Classify an error into a safe category + hint. The hint never contains
 * credentials or raw token/secret material.
 */
export function classifyMicrosoftSmtpError(err: unknown): { category: MicrosoftSmtpErrorCategory; logMessage: string } {
  const { category } = classifyError(err)
  return { category, logMessage: CATEGORY_HINTS[category] }
}

// ─── Sending ────────────────────────────────────────────────────────────────

function mapAttachments(attachments?: SendEmailParams['attachments']) {
  return attachments?.map(a => ({
    filename: a.filename,
    content: a.content,
    path: a.path,
    contentType: a.contentType,
    cid: a.cid,
  }))
}

function formatRecipients(to: string | string[]): string {
  return Array.isArray(to) ? to.join(', ') : to
}

async function sendWithTransport(params: SendEmailParams): Promise<SendEmailResult> {
  const transport = await getMicrosoftSmtpTransporter()

  const info = await transport.sendMail({
    from: params.from,
    to: params.to,
    cc: params.cc,
    bcc: params.bcc,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo,
    attachments: mapAttachments(params.attachments),
  })

  return { success: true, messageId: info.messageId || 'unknown' }
}

/**
 * Send an email through Microsoft 365 SMTP (XOAUTH2). Normalizes all failures
 * into a generic SendEmailResult — raw Microsoft/Nodemailer details are logged
 * server-side only.
 */
export async function sendMicrosoftSmtpEmail(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    return await sendWithTransport(params)
  } catch (err) {
    const { category, logMessage } = classifyMicrosoftSmtpError(err)

    // A stale/revoked token can surface as an SMTP auth failure — retry once
    // with a freshly re-provisioned token before giving up.
    if (category === 'oauth_token_failed' || category === 'smtp_auth_failed') {
      console.warn(`${MICROSOFT_SMTP_LOG_PREFIX} ${logMessage} — re-acquiring token and retrying once`)
      resetMicrosoftSmtpTransporter()
      try {
        return await sendWithTransport(params)
      } catch (retryErr) {
        const retry = classifyMicrosoftSmtpError(retryErr)
        console.error(`${MICROSOFT_SMTP_LOG_PREFIX} Send failed after retry: ${retry.logMessage}`)
        return { success: false, error: 'Failed to send email' }
      }
    }

    console.error(`${MICROSOFT_SMTP_LOG_PREFIX} Send failed: ${logMessage}`)
    return { success: false, error: 'Failed to send email' }
  }
}

/**
 * Verify Microsoft 365 SMTP connectivity/authentication without sending mail:
 * validates configuration, acquires an OAuth token, connects and authenticates
 * (XOAUTH2 handshake). Never sends an actual email.
 */
export async function verifyMicrosoftSmtpConnection(): Promise<boolean> {
  if (!isMicrosoftSmtpConfigured()) {
    console.warn(`${MICROSOFT_SMTP_LOG_PREFIX} Provider not configured — verification skipped (missing: ${getMissingEnvKeys().join(', ')})`)
    return false
  }

  try {
    console.log(`${MICROSOFT_SMTP_LOG_PREFIX} Provider configured`)
    const transport = await getMicrosoftSmtpTransporter()
    await transport.verify()
    console.log(`${MICROSOFT_SMTP_LOG_PREFIX} SMTP connection verified`)
    return true
  } catch (err) {
  const { category, logMessage } = classifyMicrosoftSmtpError(err)

  const error = err as any

  console.error(`${MICROSOFT_SMTP_LOG_PREFIX} Connection verification failed`)
  console.error(`${MICROSOFT_SMTP_LOG_PREFIX} Category: ${category}`)
  console.error(`${MICROSOFT_SMTP_LOG_PREFIX} Hint: ${logMessage}`)
  console.error(`${MICROSOFT_SMTP_LOG_PREFIX} Code: ${error?.code || 'N/A'}`)
  console.error(`${MICROSOFT_SMTP_LOG_PREFIX} Response Code: ${error?.responseCode || 'N/A'}`)
  console.error(`${MICROSOFT_SMTP_LOG_PREFIX} Response: ${error?.response || 'N/A'}`)
  console.error(`${MICROSOFT_SMTP_LOG_PREFIX} Command: ${error?.command || 'N/A'}`)

  return false
}
}
export function logMicrosoftSmtpStatus(): void {
  const configured =
    Boolean(process.env.MICROSOFT_TENANT_ID) &&
    Boolean(process.env.MICROSOFT_CLIENT_ID) &&
    Boolean(process.env.MICROSOFT_CLIENT_SECRET) &&
    Boolean(process.env.MICROSOFT_SENDER_EMAIL)

  console.log('[Email][Microsoft SMTP] ─────────────────────────────')
  console.log(`[Email][Microsoft SMTP] Provider configured: ${configured}`)
  console.log(
    `[Email][Microsoft SMTP] Host: ${process.env.MICROSOFT_SMTP_HOST || 'smtp.office365.com'}`
  )
  console.log(
    `[Email][Microsoft SMTP] Port: ${process.env.MICROSOFT_SMTP_PORT || '587'}`
  )
  console.log(
    `[Email][Microsoft SMTP] Sender: ${
      process.env.MICROSOFT_SENDER_EMAIL || 'NOT CONFIGURED'
    }`
  )
  console.log(
    `[Email][Microsoft SMTP] Tenant ID: ${
      process.env.MICROSOFT_TENANT_ID ? 'configured' : 'missing'
    }`
  )
  console.log(
    `[Email][Microsoft SMTP] Client ID: ${
      process.env.MICROSOFT_CLIENT_ID ? 'configured' : 'missing'
    }`
  )
  console.log(
    `[Email][Microsoft SMTP] Client Secret: ${
      process.env.MICROSOFT_CLIENT_SECRET ? 'configured' : 'missing'
    }`
  )
  console.log(
    `[Email][Microsoft SMTP] OAuth resource: https://outlook.office365.com/.default`
  )
  console.log('[Email][Microsoft SMTP] ─────────────────────────────')
}

// ─── Provider Registration ──────────────────────────────────────────────────

/**
 * Microsoft 365 SMTP provider — OAuth 2.0 (XOAUTH2) via Nodemailer.
 * Selected with EMAIL_PROVIDER=microsoft-smtp.
 */
export const microsoftSmtpProvider: EmailProvider = {
  name: 'microsoft-smtp',

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const event = params.eventType ? ` ${params.eventType}` : ''

    if (!isMicrosoftSmtpConfigured()) {
      console.warn(
        `${MICROSOFT_SMTP_LOG_PREFIX} Provider is not configured — set MICROSOFT_TENANT_ID, ` +
        `MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_SENDER_EMAIL, MICROSOFT_SMTP_HOST ` +
        `and MICROSOFT_SMTP_PORT. Email NOT sent.`,
      )
      return { success: false, error: 'Microsoft 365 SMTP provider is not configured' }
    }

    console.log(`${MICROSOFT_SMTP_LOG_PREFIX}${event} Sending email to ${formatRecipients(params.to)}`)

    const result = await sendMicrosoftSmtpEmail(params)

    if (result.success) {
      console.log(`${MICROSOFT_SMTP_LOG_PREFIX}${event} Email sent successfully`)
    }

    return result
  },

  async verifyConnection(): Promise<boolean> {
    return verifyMicrosoftSmtpConnection()
  },
}
