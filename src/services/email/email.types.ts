// ============================================================================
// Email Notification System — Shared Types (Backend)
// ============================================================================

/**
 * Supported email event types for the SupportHub application.
 * Each event maps to a specific template and has well-defined data requirements.
 */
export type EmailEventType =
  | 'ticket_created'
  | 'ticket_assigned'
  | 'estimate_approved'
  | 'estimate_rejected'
  | 'additional_hours'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'ticket_reopened'
  | 'ticket_reassigned'
  | 'revision_requested'
  | 'ticket_revision_requested'
  | 'estimate_requested'
  | 'additional_hours_approved'
  | 'additional_hours_rejected'
  | 'wallet_low'
  | 'wallet_empty'
  | 'support_hours_added'
  | 'support_hours_assigned'
  | 'support_renewal_reminder'
  | 'welcome'
  | 'password_reset'
  | 'password_reset_requested'
  | 'customer_created'
  | 'account_activated'
  | 'new_project'
  | 'developer_started_work'
  | 'developer_completed_work'
  | 'revision_approved'
  | 'revision_rejected'
  | 'login_credentials'
  /**
   * Fallback event type for emails that don't map to a specific event.
   */
  | 'general'

/**
 * Delivery status for queued emails.
 */
export type EmailStatus = 'queued' | 'sending' | 'sent' | 'failed'

/**
 * Email priority levels.
 */
export type EmailPriority = 'low' | 'normal' | 'high'

/**
 * Recipient information for a single email.
 */
export interface EmailRecipient {
  email: string
  name?: string
}

/**
 * Parameters for sending a raw email (low-level).
 */
export interface SendEmailParams {
  from: string
  to: string | string[]
  subject: string
  html: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
  priority?: EmailPriority
  attachments?: EmailAttachment[]
  /**
   * The business event that produced this email.
   * Carried through to the provider so providers can log the template name
   * and apply event-aware redaction (e.g. password-reset tokens).
   */
  eventType?: EmailEventType
}

/**
 * Result of a send operation.
 */
export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Email attachment specification.
 */
export interface EmailAttachment {
  filename: string
  content?: Buffer | string
  path?: string
  contentType?: string
  cid?: string
}

/**
 * Queue entry stored in memory before processing.
 */
export interface EmailQueueEntry {
  id: string
  params: SendEmailParams
  eventType: EmailEventType
  retryCount: number
  maxRetries: number
  createdAt: Date
}

// ─── Provider Interface ────────────────────────────────────────────────────

/**
 * Abstract email provider interface.
 * Implement this interface to add support for different email providers
 * (Gmail SMTP, Amazon SES, SendGrid, Resend, Microsoft 365, etc.)
 * without changing the business logic.
 */
export interface EmailProvider {
  readonly name: string
  send(params: SendEmailParams): Promise<SendEmailResult>
  verifyConnection(): Promise<boolean>
}

// ─── Template Data Interfaces ──────────────────────────────────────────────

/**
 * Base data available to all templates.
 */
export interface BaseTemplateData {
  recipientName?: string
  recipientEmail?: string
  companyName?: string
  companyLogoUrl?: string
  portalUrl?: string
}

export interface TicketCreatedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  projectName?: string
  moduleName?: string
  priority: string
  createdBy: string
  createdDate: string
  ticketLink: string
}

export interface TicketAssignedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  clientName: string
  developerName?: string
  projectName?: string
  priority: string
  dueDate?: string
  ticketLink: string
}

export interface EstimateApprovedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  estimatedHours: number
  approvedBy: string
  managerName?: string
  ticketLink: string
}

export interface EstimateRejectedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  estimatedHours: number
  rejectReason: string
  rejectedBy: string
  ticketLink: string
}

export interface AdditionalHoursTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  requestedHours: number
  currentBalance?: number
  reason?: string
  ticketLink: string
}

export interface AdditionalHoursRejectedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  requestedHours: number
  clientName: string
  rejectReason: string
  projectName?: string
  ticketLink: string
}

export interface TicketResolvedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  resolvedBy: string
  resolutionSummary?: string
  ticketLink: string
}

export interface TicketClosedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  closedBy: string
  resolutionTime?: string
  feedbackLink?: string
}

export interface WelcomeTemplateData extends BaseTemplateData {
  userEmail: string
  loginUrl: string
}

export interface PasswordResetTemplateData extends BaseTemplateData {
  userEmail: string
  resetLink: string
  expiryMinutes?: number
}

export interface PasswordResetRequestedTemplateData extends BaseTemplateData {
  requesterName: string
  requesterEmail: string
  requesterRole: string
  requestedAt: string
  reference: string
  adminUrl: string
}

export interface WalletLowTemplateData extends BaseTemplateData {
  /** @deprecated Use clientName instead. Wallet is client-level, not project-level. */
  projectName?: string
  clientName?: string
  remainingHours: number
  threshold: number
  walletLink: string
}

export interface CustomerCreatedTemplateData extends BaseTemplateData {
  customerName: string
  customerEmail: string
  projectName?: string
  createdBy: string
  portalUrl: string
}

export interface AccountActivatedTemplateData extends BaseTemplateData {
  userEmail: string
  userName: string
  loginUrl: string
}

// ─── Ticket Reopened ──────────────────────────────────────────────────────

export interface TicketReopenedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  reopenedBy: string
  reopenReason: string
  ticketLink: string
}

// ─── Ticket Reassigned ────────────────────────────────────────────────────

export interface TicketReassignedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  assignedBy: string
  previousDeveloper?: string
  newDeveloper: string
  priority: string
  ticketLink: string
}

// ─── Revision Requested ───────────────────────────────────────────────────

export interface RevisionRequestedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  requestedByName: string
  revisionNotes: string
  ticketLink: string
}

// ─── Estimate Requested (to client) ───────────────────────────────────────

export interface EstimateRequestedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  estimatedHours: number
  estimateNotes: string
  approvalDeadline: string
  ticketLink: string
}

// ─── Additional Hours Approved ────────────────────────────────────────────

export interface AdditionalHoursApprovedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  requestedHours: number
  approvedBy: string
  newTotalHours: number
  ticketLink: string
}

// ─── Wallet Empty ─────────────────────────────────────────────────────────

export interface WalletEmptyTemplateData extends BaseTemplateData {
  /** @deprecated Use clientName instead. Wallet is client-level, not project-level. */
  projectName?: string
  clientName?: string
  walletLink: string
}

// ─── Support Hours Added ──────────────────────────────────────────────────

export interface SupportHoursAddedTemplateData extends BaseTemplateData {
  /** @deprecated Use clientName instead. Wallet is client-level, not project-level. */
  projectName?: string
  clientName?: string
  addedHours: number
  newBalance: number
  transactionType?: string
  walletLink: string
}

// ─── New Project ───────────────────────────────────────────────────────────

export interface NewProjectTemplateData extends BaseTemplateData {
  projectName: string
  projectCode: string
  clientName?: string
  managerName?: string
  startDate?: string
  projectLink: string
}

// ─── Developer Work Started / Completed ────────────────────────────────────

export interface DeveloperStartedWorkTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  developerName?: string
  description?: string
  ticketLink: string
}

export interface DeveloperCompletedWorkTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  developerName?: string
  durationMinutes?: number
  ticketLink: string
}

// ─── Revision Approved / Rejected ──────────────────────────────────────────

export interface RevisionApprovedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  revisionNumber: number
  approvedBy: string
  ticketLink: string
}

export interface RevisionRejectedTemplateData extends BaseTemplateData {
  ticketNumber: string
  ticketTitle: string
  revisionNumber: number
  rejectionReason?: string
  ticketLink: string
}

// ─── Support Renewal Reminder ──────────────────────────────────────────────

export interface SupportRenewalReminderTemplateData extends BaseTemplateData {
  remainingHours?: number
  expiryDate?: string
  daysToExpiry?: number
  isLowHours?: boolean
  isExpiring?: boolean
  isExpired?: boolean
  walletLink: string
}

// ─── Login Credentials ──────────────────────────────────────────────────────
// Sent when an admin explicitly opts in ("Send login credentials via email")
// during customer onboarding / user creation. Email-only channel.

export interface LoginCredentialsTemplateData extends BaseTemplateData {
  /** The user's sign-in email address. */
  userEmail: string
  /** Plaintext initial password (auto-generated or admin-set). */
  initialPassword: string
  /** URL the recipient uses to sign in. */
  loginUrl: string
  /** Optional link to reset the password after first login. */
  resetLink?: string
  /** Optional portal home URL. */
  portalUrl?: string
}

/**
 * Union type of all template data types.
 */
export type EmailTemplateData =
  | TicketCreatedTemplateData
  | TicketAssignedTemplateData
  | EstimateApprovedTemplateData
  | EstimateRejectedTemplateData
  | AdditionalHoursTemplateData
  | AdditionalHoursRejectedTemplateData
  | TicketResolvedTemplateData
  | TicketClosedTemplateData
  | WelcomeTemplateData
  | PasswordResetTemplateData
  | PasswordResetRequestedTemplateData
  | WalletLowTemplateData
  | CustomerCreatedTemplateData
  | AccountActivatedTemplateData
  | TicketReopenedTemplateData
  | TicketReassignedTemplateData
  | RevisionRequestedTemplateData
  | EstimateRequestedTemplateData
  | AdditionalHoursApprovedTemplateData
  | WalletEmptyTemplateData
  | SupportHoursAddedTemplateData
  | NewProjectTemplateData
  | DeveloperStartedWorkTemplateData
  | DeveloperCompletedWorkTemplateData
  | RevisionApprovedTemplateData
  | RevisionRejectedTemplateData
  | SupportRenewalReminderTemplateData
  | LoginCredentialsTemplateData

// ─── Sender Config ──────────────────────────────────────────────────────────

/**
 * Sender configuration loaded from environment variables.
 */
export interface SenderConfig {
  fromName: string
  fromAddress: string
}
