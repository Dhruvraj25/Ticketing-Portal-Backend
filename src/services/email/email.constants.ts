// ============================================================================
// Email Notification System — Constants & Defaults
// ============================================================================

import type { SenderConfig } from './email.types'

/**
 * Default sender configuration values.
 * All values should be overridden via environment variables.
 */
export const DEFAULT_SENDER_CONFIG: SenderConfig = {
  fromName: 'Support Hero',
  fromAddress: 'support@infinixotech.com',
}

/**
 * Environment variable keys for selecting the active email provider.
 * EMAIL_PROVIDER is the canonical key; PROVIDER_TYPE is supported as a
 * legacy alias.
 */
export const EMAIL_ENV_KEYS = {
  PROVIDER: 'EMAIL_PROVIDER',
  LEGACY_PROVIDER: 'PROVIDER_TYPE',
  FROM: 'EMAIL_FROM',
  FROM_NAME: 'EMAIL_FROM_NAME',
  FROM_ADDRESS: 'EMAIL_FROM_ADDRESS',
} as const

/**
 * Environment variable keys for the Resend email transport (legacy provider).
 */
export const RESEND_ENV_KEYS = {
  API_KEY: 'RESEND_API_KEY',
  FROM_NAME: 'EMAIL_FROM_NAME',
  FROM_ADDRESS: 'EMAIL_FROM_ADDRESS',
} as const

/**
 * Environment variable keys for the Microsoft 365 SMTP production provider
 * (EMAIL_PROVIDER=microsoft-smtp). Only required when that provider is active.
 */
export const MICROSOFT_ENV_KEYS = {
  TENANT_ID: 'MICROSOFT_TENANT_ID',
  CLIENT_ID: 'MICROSOFT_CLIENT_ID',
  CLIENT_SECRET: 'MICROSOFT_CLIENT_SECRET',
  SENDER_EMAIL: 'MICROSOFT_SENDER_EMAIL',
  SMTP_HOST: 'MICROSOFT_SMTP_HOST',
  SMTP_PORT: 'MICROSOFT_SMTP_PORT',
} as const

/**
 * Microsoft 365 SMTP connection defaults and the OAuth 2.0 resource/scope.
 *
 * The SMTP provider uses the Exchange Online resource (NOT Graph):
 *   https://outlook.office365.com/.default
 * App-only (client credentials) SMTP requires Exchange Online authorization
 * (SMTP.SendAsApp permission, service-principal registration and mailbox
 * Send-As authorization) — administrator-managed, never automated here.
 */
export const MICROSOFT_SMTP = {
  DEFAULT_HOST: 'smtp.office365.com',
  DEFAULT_PORT: 587,
  TOKEN_SCOPE: 'https://outlook.office365.com/.default',
} as const

/**
 * Default retry configuration for email sending.
 */
export const EMAIL_RETRY = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 1_000,
  BACKOFF_MULTIPLIER: 2,
} as const

/**
 * Queue processing defaults.
 */
export const EMAIL_QUEUE = {
  BATCH_SIZE: 10,
  POLL_INTERVAL_MS: 5_000,
  MAX_CONCURRENT: 5,
} as const

/**
 * Logging prefixes for email system.
 */
export const EMAIL_LOG_PREFIX = '[Email]'
export const EMAIL_QUEUE_PREFIX = '[Email Queue]'
export const EMAIL_TRANSPORT_PREFIX = '[Email Transport]'
export const EMAIL_TEMPLATE_PREFIX = '[Email Template]'
export const MICROSOFT_SMTP_LOG_PREFIX = '[Email][Microsoft SMTP]'

// ─── Microsoft Graph Error Code Mapping ────────────────────────────────────
// Maps Graph HTTP status codes to safe, user-facing error messages.
// NEVER expose Graph URLs, tokens, tenant IDs, or raw JSON to users.

export const GRAPH_ERROR_MESSAGES: Record<number, string> = {
  400: 'The email could not be sent because the request was invalid.',
  401: 'The email service is not authorized to send this message. Please contact an administrator.',
  403: 'The email service is not authorized to send this message. Please contact an administrator.',
  404: 'The email could not be sent because the configured sender or recipient could not be found.',
  429: 'The email service is temporarily busy. Please try again shortly.',
  500: 'The email service is temporarily unavailable. Please try again later.',
  502: 'The email service is temporarily unavailable. Please try again later.',
  503: 'The email service is temporarily unavailable. Please try again later.',
}

/**
 * Get a safe, user-facing error message for a Microsoft Graph error.
 * Falls back to a generic message for unknown status codes.
 */
export function getGraphErrorMessage(statusCode: number): string {
  return GRAPH_ERROR_MESSAGES[statusCode] || 'The email could not be sent. Please try again later.'
}
