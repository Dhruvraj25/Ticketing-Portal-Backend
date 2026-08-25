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
      if (!value.startsWith('https://')) return { passed: false, message: 'Must be HTTPS URL' }
      try {
        new URL(value)
      } catch {
        return { passed: false, message: 'Invalid URL format' }
      }
      return { passed: true, message: 'Valid HTTPS webhook URL' }
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
      value: value ? value.substring(0, 50) + '...' : undefined,
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
