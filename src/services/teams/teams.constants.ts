// ============================================================================
// Microsoft Teams Notification System — Constants & Defaults
// ============================================================================

/**
 * Environment variable keys for Teams Webhook integration.
 * All are optional — the system gracefully disables Teams when absent.
 */
export const TEAMS_ENV_KEYS = {
  WEBHOOK_URL: 'TEAMS_WEBHOOK_URL',
} as const

/**
 * Logging prefixes for Teams notification system.
 */
export const TEAMS_LOG_PREFIX = '[Teams]'
export const TEAMS_WEBHOOK_PREFIX = '[Teams Webhook]'
export const TEAMS_CARD_PREFIX = '[Teams Card]'
export const TEAMS_QUEUE_PREFIX = '[Teams Queue]'
export const TEAMS_MONITOR_PREFIX = '[Teams Monitor]'
export const TEAMS_CONFIG_PREFIX = '[Teams Config]'

/**
 * Color mapping for Teams notification severity.
 * Maps to Adaptive Card color scheme.
 */
export const TEAMS_COLORS = {
  default: 'default',
  accent: 'accent',
  success: 'good',
  warning: 'warning',
  danger: 'attention',
  info: 'accent',
} as const

/**
 * Event-to-color mapping for consistent visual treatment.
 */
export const EVENT_COLOR_MAP: Record<string, string> = {
  ticket_created: 'accent',
  ticket_updated: 'accent',
  ticket_assigned: 'accent',
  ticket_reassigned: 'accent',
  ticket_resolved: 'success',
  ticket_closed: 'default',
  ticket_reopened: 'warning',
  customer_created: 'accent',
  account_activated: 'success',
  estimate_requested: 'accent',
  estimate_approved: 'success',
  estimate_rejected: 'warning',
  revision_requested: 'warning',
  additional_hours_requested: 'warning',
  additional_hours_approved: 'success',
  additional_hours_rejected: 'attention',
  developer_started_work: 'accent',
  developer_completed_work: 'success',
  wallet_low: 'warning',
  wallet_empty: 'danger',
  support_hours_added: 'success',
  new_project: 'accent',
  welcome: 'accent',
  password_reset: 'accent',
  test_message: 'info',
}

/**
 * Event-to-icon mapping for Adaptive Card icons.
 */
export const EVENT_ICON_MAP: Record<string, string> = {
  ticket_created: '➕',
  ticket_updated: '✏️',
  ticket_assigned: '👤',
  ticket_reassigned: '🔄',
  ticket_resolved: '✅',
  ticket_closed: '🔒',
  ticket_reopened: '🔓',
  customer_created: '🎉',
  account_activated: '✅',
  estimate_requested: '📊',
  estimate_approved: '👍',
  estimate_rejected: '👎',
  revision_requested: '🔄',
  revision_approved: '✅',
  revision_rejected: '❌',
  additional_hours_requested: '⏰',
  additional_hours_approved: '✅',
  additional_hours_rejected: '❌',
  developer_started_work: '▶️',
  developer_completed_work: '🏁',
  wallet_low: '⚠️',
  wallet_empty: '🛑',
  support_hours_added: '📦',
  new_project: '🚀',
  welcome: '👋',
  password_reset: '🔑',
  test_message: '🧪',
}

// ─── Queue Configuration ────────────────────────────────────────────────────

/**
 * Default retry configuration for Teams message sending.
 */
export const TEAMS_RETRY = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 1_000,
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY_MS: 30_000,
} as const

/**
 * Queue processing defaults.
 */
export const TEAMS_QUEUE = {
  BATCH_SIZE: 10,
  POLL_INTERVAL_MS: 5_000,
  MAX_CONCURRENT: 5,
  MAX_QUEUE_SIZE: 1000,
} as const

// ─── Webhook Configuration ──────────────────────────────────────────────────

/**
 * Webhook request defaults.
 */
export const TEAMS_WEBHOOK = {
  TIMEOUT_MS: 10_000,
  MAX_RESPONSE_BODY_CHARS: 2000,
} as const

// ─── Monitoring Configuration ───────────────────────────────────────────────

/**
 * Maximum number of monitor events to retain in memory.
 */
export const TEAMS_MONITOR = {
  MAX_EVENTS: 1000,
  MAX_LOG_LINES: 500,
  HEALTH_CHECK_INTERVAL_MS: 60_000,
} as const

// ─── Mock Mode Configuration ────────────────────────────────────────────────

/**
 * Simulated latency range for mock webhook calls (ms).
 */
export const MOCK_WEBHOOK = {
  MIN_LATENCY_MS: 5,
  MAX_LATENCY_MS: 50,
} as const
