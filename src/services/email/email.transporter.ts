// ============================================================================
// Email Transport — Singleton Resend Client
// ============================================================================
//
// Manages a single reusable Resend API client — used ONLY when the active
// provider is 'resend' (see email.provider.ts). Console and Microsoft 365
// providers never create a Resend client.
// Never create Resend clients inside business logic — use this singleton.
//
// Lifecycle:
//   1. initTransporter() — called once during application startup
//   2. getTransporter() — reused throughout the application lifetime
//
// Environment variables:
//   RESEND_API_KEY     — Resend API key (re_...) — required for resend provider
//   EMAIL_FROM         — sender email address (e.g., support@infinixotech.com)
//   EMAIL_FROM_ADDRESS — legacy alias for EMAIL_FROM
//   EMAIL_FROM_NAME    — display name for the sender (e.g., SupportHub)
//
// Missing email configuration never prevents the application from starting —
// the client simply stays uninitialized and emails are logged instead of sent.
// ============================================================================

import { Resend } from 'resend'
import type { SenderConfig } from './email.types'
import { DEFAULT_SENDER_CONFIG, RESEND_ENV_KEYS, EMAIL_ENV_KEYS, EMAIL_TRANSPORT_PREFIX } from './email.constants'

// ─── Module-level singleton ─────────────────────────────────────────────────

let client: Resend | null = null
let isInitialized = false
let initializationError: Error | null = null

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load sender configuration from environment variables.
 * EMAIL_FROM is canonical; EMAIL_FROM_ADDRESS is honoured as a legacy alias.
 * Falls back to defaults for any missing values.
 */
export function loadSenderConfig(): SenderConfig {
  return {
    fromName: process.env[RESEND_ENV_KEYS.FROM_NAME] || DEFAULT_SENDER_CONFIG.fromName,
    fromAddress: process.env[EMAIL_ENV_KEYS.FROM] || process.env[EMAIL_ENV_KEYS.FROM_ADDRESS] || DEFAULT_SENDER_CONFIG.fromAddress,
  }
}

/**
 * Build the RFC 5322 formatted "from" address: "Name <email>".
 */
export function buildFromAddress(config: SenderConfig): string {
  return `${config.fromName} <${config.fromAddress}>`
}

/**
 * Initialize the singleton Resend client — but ONLY when the active provider
 * is 'resend'. Console and Microsoft 365 providers never need a Resend client
 * and must never attempt to create one (they must not contact Resend at all).
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * Never throws — missing configuration is logged and the client stays disabled.
 *
 * @returns {Promise<boolean>} true if startup should continue,
 *                             false only if client creation failed
 */
export async function initTransporter(): Promise<boolean> {
  if (isInitialized) {
    return client !== null
  }

  isInitialized = true

  // Read provider selection directly (avoid circular import with email.provider).
  const provider = (process.env[EMAIL_ENV_KEYS.PROVIDER] || process.env[EMAIL_ENV_KEYS.LEGACY_PROVIDER] || '').trim().toLowerCase()
  const activeIsResend = provider ? provider === 'resend' : Boolean(process.env[RESEND_ENV_KEYS.API_KEY])

  if (!activeIsResend) {
    // Console / Microsoft / unknown — never create or contact a Resend client.
    console.log(`${EMAIL_TRANSPORT_PREFIX} Resend client not needed for active provider '${provider || 'console'}'`)
    client = null
    initializationError = null
    return true
  }

  const apiKey = process.env[RESEND_ENV_KEYS.API_KEY]
  if (!apiKey) {
    console.warn(`${EMAIL_TRANSPORT_PREFIX} Resend API key is not configured — email sending disabled`)
    client = null
    initializationError = null
    return true
  }

  try {
    client = new Resend(apiKey)
    initializationError = null
    console.log(`${EMAIL_TRANSPORT_PREFIX} Resend client initialized`)
    return true
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Failed to create Resend client')
    initializationError = error
    client = null
    console.error(`${EMAIL_TRANSPORT_PREFIX} Failed to create Resend client:`, error.message)
    return false
  }
}

/**
 * Get the singleton Resend client instance.
 * Returns null if the client has not been initialized or initialization failed.
 */
export function getTransporter(): Resend | null {
  return client
}

/**
 * Check if the Resend client has been initialized.
 */
export function isTransporterReady(): boolean {
  return isInitialized && client !== null
}

/**
 * Verify the Resend transport readiness.
 * Resend is an HTTP API — there is no connection handshake, so readiness is
 * equivalent to having a configured API key and initialized client.
 *
 * @returns {Promise<boolean>} true if the client is ready
 */
export async function verifyTransporter(): Promise<boolean> {
  if (!client) {
    console.warn(`${EMAIL_TRANSPORT_PREFIX} Cannot verify: Resend client not initialized`)
    return false
  }
  return true
}

/**
 * Get the last initialization error.
 */
export function getInitializationError(): Error | null {
  return initializationError
}

/**
 * Reset the client (useful for testing or reconfiguration).
 */
export function resetTransporter(): void {
  client = null
  isInitialized = false
  initializationError = null
}
