// ============================================================================
// Microsoft Teams Notification System — Types & Interfaces
// ============================================================================
// Follows the same pattern as email.types.ts for consistency.
// All Teams-specific types are defined here.
// ============================================================================

/**
 * Supported Teams notification event types.
 * Maps one-to-one with email events for unified dispatching.
 */
export type TeamsEventType =
  | 'ticket_created'
  | 'ticket_updated'
  | 'ticket_assigned'
  | 'ticket_reassigned'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'ticket_reopened'
  | 'customer_created'
  | 'account_activated'
  | 'estimate_requested'
  | 'estimate_approved'
  | 'estimate_rejected'
  | 'revision_requested'
  | 'additional_hours_requested'
  | 'additional_hours_approved'
  | 'additional_hours_rejected'
  | 'developer_started_work'
  | 'developer_completed_work'
  | 'wallet_low'
  | 'wallet_empty'
  | 'support_hours_added'
  | 'new_project'
  | 'welcome'
  | 'password_reset'
  | 'test_message'

/**
 * Teams notification severity/color.
 * Used to color the Adaptive Card accent bar.
 */
export type TeamsNotificationColor = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

/**
 * Configuration for Teams notification delivery via Webhook.
 */
export interface TeamsConfig {
  webhookUrl?: string
  enabled: boolean
  /** Mock mode flag — always true when webhook URL is absent */
  mockMode: boolean
}

/**
 * Teams notification payload — the full data sent to a Teams channel or user.
 */
export interface TeamsNotificationPayload {
  /** Unique correlation ID for this notification */
  id: string
  /** Event type */
  eventType: TeamsEventType
  /** Notification title (bold heading in card) */
  title: string
  /** Short summary message */
  message: string
  /** Name of the project (if applicable) */
  projectName?: string
  /** Ticket number as string (e.g., "#145") */
  ticketId?: string
  /** Ticket title / subject */
  ticketTitle?: string
  /** Name of the client involved */
  clientName?: string
  /** Name of the assigned user (developer/manager) */
  assignedTo?: string
  /** Email of the assigned user */
  assignedToEmail?: string
  /** Estimated hours (as formatted string, e.g., "8h") */
  estimateHours?: string
  /** Additional hours requested (as formatted string, e.g., "4h") */
  additionalHours?: string
  /** Reason for additional hours or rejection */
  reason?: string
  /** Revision notes */
  revisionNotes?: string
  /** Revision number */
  revisionNumber?: string
  /** Approver name (estimate/revision approved) */
  approvedBy?: string
  /** Rejector name (revision rejected) */
  rejectedBy?: string
  /** Rejection reason (estimate/revision rejected) */
  rejectionReason?: string
  /** Support hours added to a wallet (wallet recharge) */
  assignedHours?: string | number
  /** Remaining wallet balance after the recharge */
  remainingBalance?: number | string
  /** Wallet contract validity start date */
  supportStartDate?: string | null
  /** Wallet contract validity end date */
  supportEndDate?: string | null
  /** Developer who started/completed work */
  developerName?: string
  /** Deep-link URL to the resource in the portal */
  url?: string
  /** Priority level (Low, Medium, High, Critical) */
  priority?: string
  /** Current ticket/workflow status */
  status?: string
  /** Name of the user who triggered the action */
  createdBy?: string
  /** Color accent for the card */
  color?: TeamsNotificationColor
  /** Optional array of fields for extra key-value pairs */
  fields?: { label: string; value: string }[]
  /** The target Teams channel (defaults to defaultChannelId) */
  channelId?: string
  /** The target Team ID (defaults to defaultTeamId) */
  teamId?: string
  /** Recipient user ID — used to enforce the customer Teams preference on the backend */
  recipientUserId?: string
  /** Recipient display name — used for the @mention in the Teams card */
  recipientName?: string
  /** Recipient email/UPN — used to resolve the @mention in Teams */
  recipientEmail?: string
}

/**
 * A user mention attached to a Teams webhook message.
 * Renders a highlighted mention pill in Teams for the recipient (the legitimate
 * popup/banner mechanism available to webhook-based messages — no @everyone/@channel).
 */
export interface TeamsMention {
  /** Display name used in the <at> tag */
  name: string
  /** Email/UPN or Azure AD object ID used to resolve the user */
  id: string
}

/**
 * Result of a Teams notification send attempt.
 */
export interface TeamsSendResult {
  success: boolean
  message?: string
  error?: string
  /** HTTP status code from the Graph API response */
  statusCode?: number
  /** Raw response body from the Graph API */
  responseBody?: string
  /** Parsed error code from Graph API error response (e.g. 'AccessDenied', 'InvalidAuthenticationToken') */
  errorCode?: string
  messageId?: string
  durationMs?: number
}

// ─── Queue Types ────────────────────────────────────────────────────────────

/**
 * Queue entry for Teams message delivery.
 * Follows the same pattern as EmailQueueEntry in email.types.ts.
 */
export interface TeamsQueueEntry {
  id: string
  eventType: TeamsEventType
  payload: TeamsNotificationPayload
  card: AdaptiveCard
  teamId: string
  channelId: string
  mention?: TeamsMention | null
  retryCount: number
  maxRetries: number
  createdAt: Date
  lastError?: string
}

/**
 * Queue processing statistics.
 */
export interface TeamsQueueStats {
  totalProcessed: number
  totalFailed: number
  totalRetried: number
  currentDepth: number
  averageProcessingTimeMs: number
}

// ─── Configuration Validation Types ─────────────────────────────────────────

/**
 * Configuration validation severity.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info'

/**
 * Single validation result.
 */
export interface TeamsValidationResult {
  key: string
  label: string
  severity: ValidationSeverity
  message: string
  passed: boolean
  value?: string
}

/**
 * Full configuration validation report.
 */
export interface TeamsValidationReport {
  valid: boolean
  mockMode: boolean
  results: TeamsValidationResult[]
  timestamp: string
}

// ─── Monitoring Types ───────────────────────────────────────────────────────

/**
 * Monitoring event for the Teams system.
 */
export interface TeamsMonitorEvent {
  id: string
  type: 'send' | 'error' | 'retry' | 'token' | 'queue' | 'config' | 'test'
  eventType?: TeamsEventType
  message: string
  durationMs?: number
  timestamp: number
  metadata?: Record<string, unknown>
}

/**
 * Health status of the Teams integration.
 */
export interface TeamsHealthStatus {
  provider: 'microsoft-teams-webhook'
  configured: boolean
  mockMode: boolean
  ready: boolean
  status: 'ready' | 'partial' | 'disabled'
  webhookConfigured: boolean
  queueDepth: number
  messagesSent: number
  messagesFailed: number
  lastTestAt: string | null
  lastTestResult: 'success' | 'failure' | null
  message: string
}

// ─── Adaptive Card Types ────────────────────────────────────────────────────

/**
 * Adaptive Card JSON structure (simplified).
 * Full spec: https://adaptivecards.io/schemas/adaptive-card.json
 */
export interface AdaptiveCard {
  type: 'AdaptiveCard'
  version: string
  $schema?: string
  body: AdaptiveCardElement[]
  actions?: AdaptiveCardAction[]
  accentColor?: string
  msTeams?: {
    width?: 'full'
  }
}

export type AdaptiveCardElement =
  | AdaptiveTextBlock
  | AdaptiveFactSet
  | AdaptiveColumnSet
  | AdaptiveImage
  | AdaptiveContainer
  | AdaptiveActionSet

export interface AdaptiveTextBlock {
  type: 'TextBlock'
  text: string
  size?: 'small' | 'default' | 'medium' | 'large' | 'extraLarge'
  weight?: 'lighter' | 'default' | 'bolder'
  color?: 'default' | 'dark' | 'light' | 'accent' | 'good' | 'warning' | 'attention'
  wrap?: boolean
  spacing?: 'none' | 'small' | 'default' | 'medium' | 'large' | 'padding'
  isSubtle?: boolean
  fontType?: 'default' | 'monospace'
  horizontalAlignment?: 'left' | 'center' | 'right'
}

export interface AdaptiveFactSet {
  type: 'FactSet'
  facts: { title: string; value: string }[]
  spacing?: 'none' | 'small' | 'default' | 'medium' | 'large' | 'padding'
}

export interface AdaptiveColumnSet {
  type: 'ColumnSet'
  columns: AdaptiveColumn[]
  spacing?: 'none' | 'small' | 'default' | 'medium' | 'large' | 'padding'
}

export interface AdaptiveColumn {
  type: 'Column'
  width: string | 'auto' | 'stretch'
  items: AdaptiveCardElement[]
  verticalContentAlignment?: 'top' | 'center' | 'bottom'
}

export interface AdaptiveImage {
  type: 'Image'
  url: string
  size?: 'small' | 'medium' | 'large' | 'auto' | 'stretch'
  altText?: string
  spacing?: 'none' | 'small' | 'default' | 'medium' | 'large' | 'padding'
}

export interface AdaptiveContainer {
  type: 'Container'
  items: AdaptiveCardElement[]
  spacing?: 'none' | 'small' | 'default' | 'medium' | 'large' | 'padding'
  style?: 'default' | 'emphasis' | 'good' | 'attention' | 'warning' | 'accent'
}

export interface AdaptiveActionSet {
  type: 'ActionSet'
  actions: AdaptiveCardAction[]
  spacing?: 'none' | 'small' | 'default' | 'medium' | 'large' | 'padding'
}

export type AdaptiveCardAction =
  | AdaptiveOpenUrlAction
  | AdaptiveSubmitAction
  | AdaptiveShowCardAction

export interface AdaptiveOpenUrlAction {
  type: 'Action.OpenUrl'
  title: string
  url: string
}

export interface AdaptiveSubmitAction {
  type: 'Action.Submit'
  title: string
  data: Record<string, unknown>
}

export interface AdaptiveShowCardAction {
  type: 'Action.ShowCard'
  title: string
  card: AdaptiveCard
}
