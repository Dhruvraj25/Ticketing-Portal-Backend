// ============================================================================
// Teams Configuration Validator — Webhook URL Validation
// ============================================================================
// Validates the Teams webhook URL configuration at runtime.
// Provides detailed validation results for the admin status page.
//
// The webhook URL is optional. When missing, the integration gracefully
// operates in mock mode with appropriate warnings.
// ============================================================================

import {
  TEAMS_ENV_KEYS,
  TEAMS_CONFIG_PREFIX,
} from './teams.constants'
import type { TeamsConfig, TeamsValidationResult, TeamsValidationReport } from './teams.types'

// ─── Webhook URL Validation ─────────────────────────────────────────────────

/**
 * Host suffixes accepted as a Microsoft Teams webhook endpoint.
 * Covers the modern Power Automate "Workflow" webhook (*.logic.azure.com,
 * *.powerautomate.com / *.powerplatform.com) and the legacy Incoming Webhook
 * (*.webhook.office.com, *.office.com). A link pointing anywhere else is not a
 * Teams channel and is rejected before it is ever stored or called.
 */
export const TEAMS_WEBHOOK_HOST_SUFFIXES = [
  '.webhook.office.com',
  '.logic.azure.com',
  '.powerautomate.com',
  '.powerplatform.com',
  '.office.com',
] as const

/**
 * Validate a Teams channel link pasted by an admin.
 * Pure and side-effect free: the returned message never echoes the value, so a
 * rejected link can never leak into an error response or a log line.
 */
export function validateTeamsWebhookUrl(raw: string | null | undefined): { valid: boolean; message: string } {
  const value = (raw || '').trim()
  if (!value) return { valid: false, message: 'Teams channel link is required' }
  if (value.length > 2048) return { valid: false, message: 'Teams channel link is too long' }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { valid: false, message: 'Teams channel link is not a valid URL' }
  }

  if (url.protocol !== 'https:') {
    return { valid: false, message: 'Teams channel link must use HTTPS' }
  }
  if (url.username || url.password) {
    return { valid: false, message: 'Teams channel link must not contain embedded credentials' }
  }

  const host = url.hostname.toLowerCase()
  const allowed = TEAMS_WEBHOOK_HOST_SUFFIXES.some(function (suffix) {
    const bare = suffix.slice(1)
    return host === bare || host.endsWith(suffix)
  })
  if (!allowed) {
    return {
      valid: false,
      message: 'Teams channel link must be a Microsoft Teams webhook URL (webhook.office.com or *.logic.azure.com)',
    }
  }

  return { valid: true, message: 'Valid Microsoft Teams webhook URL' }
}

// ─── Validation Rules ───────────────────────────────────────────────────────

interface ValidationRule {
  key: string
  label: string
  envKey: string
  required: boolean
  requiredForLive: boolean
  validate: (value: string | undefined) => { passed: boolean; message: string }
}

const VALIDATION_RULES: ValidationRule[] = [
  {
    key: 'webhookUrl',
    label: 'Webhook URL',
    envKey: TEAMS_ENV_KEYS.WEBHOOK_URL,
    required: false,
    requiredForLive: true,
    validate: function (value) {
      if (!value) return { passed: false, message: 'Not set — mock mode active' }
      const result = validateTeamsWebhookUrl(value)
      return { passed: result.valid, message: result.message }
    },
  },
]

// ─── Public API ─────────────────────────────────────────────────────────────

export function validateConfig(config: TeamsConfig): TeamsValidationReport {
  const results: TeamsValidationResult[] = []

  for (const rule of VALIDATION_RULES) {
    const value = config.webhookUrl
    const validation = rule.validate(value)

    let severity: 'error' | 'warning' | 'info'
    if (validation.passed) {
      severity = 'info'
    } else if (rule.requiredForLive && !config.enabled) {
      severity = 'warning'
    } else if (rule.requiredForLive) {
      severity = 'error'
    } else {
      severity = 'info'
    }

    results.push({
      key: rule.key,
      label: rule.label,
      severity,
      message: validation.message,
      passed: validation.passed,
      // Never expose any portion of the webhook URL — it carries an embedded
      // signature that authenticates the call, equivalent to a secret.
      value: value ? '(configured)' : undefined,
    })
  }

  const errors = results.filter(function (r) { return r.severity === 'error' })

  return {
    valid: errors.length === 0,
    mockMode: !config.enabled,
    results,
    timestamp: new Date().toISOString(),
  }
}

export function getConfigStatus(config: TeamsConfig): {
  configured: boolean
  ready: boolean
  status: 'ready' | 'partial' | 'disabled'
  message: string
} {
  if (config.enabled && config.webhookUrl) {
    return {
      configured: true,
      ready: true,
      status: 'ready',
      message: 'Teams webhook is configured and ready',
    }
  }
  if (config.enabled) {
    return {
      configured: true,
      ready: false,
      status: 'partial',
      message: 'Webhook URL present but invalid',
    }
  }
  return {
    configured: false,
    ready: false,
    status: 'disabled',
    message: 'Teams integration disabled — set TEAMS_WEBHOOK_URL to enable',
  }
}

// ─── Barrel Export ──────────────────────────────────────────────────────────

export const teamsConfigValidator = {
  validateConfig,
  getConfigStatus,
}
