// ============================================================================
// Email Service — Main API for Sending Emails
// ============================================================================
//
// This is the primary entry point for all email sending in the application.
// Every send method follows these principles:
//
//   1. NEVER blocks the caller — always queues asynchronous processing
//   2. NEVER throws on email failure — errors are caught and logged
//   3. Each method internally calls the generic send() method
//   4. Template rendering is separate from transport logic
//
// Usage:
//   import { emailService } from './services/email/email.service'
//   await emailService.sendTicketCreated(data)
// ============================================================================

import { enqueue, sendImmediately } from './email.queue'
import { buildFromAddress, loadSenderConfig } from './email.transporter'
import type { SendEmailParams, EmailEventType, EmailAttachment, EmailPriority } from './email.types'
import type {
  TicketCreatedTemplateData,
  TicketAssignedTemplateData,
  EstimateApprovedTemplateData,
  EstimateRejectedTemplateData,
  AdditionalHoursTemplateData,
  AdditionalHoursRejectedTemplateData,
  TicketResolvedTemplateData,
  TicketClosedTemplateData,
  TicketReopenedTemplateData,
  TicketReassignedTemplateData,
  RevisionRequestedTemplateData,
  EstimateRequestedTemplateData,
  AdditionalHoursApprovedTemplateData,
  WalletEmptyTemplateData,
  SupportHoursAddedTemplateData,
  WelcomeTemplateData,
  PasswordResetTemplateData,
  PasswordResetRequestedTemplateData,
  WalletLowTemplateData,
  CustomerCreatedTemplateData,
  AccountActivatedTemplateData,
  NewProjectTemplateData,
  DeveloperStartedWorkTemplateData,
  DeveloperCompletedWorkTemplateData,
  RevisionApprovedTemplateData,
  RevisionRejectedTemplateData,
  SupportRenewalReminderTemplateData,
  LoginCredentialsTemplateData,
} from './email.types'

import { ticketCreatedTemplate } from './templates/ticket-created'
import { ticketAssignedTemplate } from './templates/ticket-assigned'
import { estimateApprovedTemplate } from './templates/estimate-approved'
import { estimateRejectedTemplate } from './templates/estimate-rejected'
import { additionalHoursTemplate } from './templates/additional-hours'
import { additionalHoursRejectedTemplate } from './templates/additional-hours-rejected'
import { ticketResolvedTemplate } from './templates/ticket-resolved'
import { ticketClosedTemplate } from './templates/ticket-closed'
import { ticketReopenedTemplate } from './templates/ticket-reopened'
import { ticketReassignedTemplate } from './templates/ticket-reassigned'
import { revisionRequestedTemplate } from './templates/revision-requested'
import { estimateRequestedTemplate } from './templates/estimate-requested'
import { additionalHoursApprovedTemplate } from './templates/additional-hours-approved'
import { walletEmptyTemplate } from './templates/wallet-empty'
import { supportHoursAddedTemplate } from './templates/support-hours-added'
import { welcomeTemplate } from './templates/welcome'
import { passwordResetTemplate } from './templates/password-reset'
import { passwordResetRequestedTemplate } from './templates/password-reset-requested'
import { walletLowTemplate } from './templates/wallet-low'
import { customerCreatedTemplate } from './templates/customer-created'
import { accountActivatedTemplate } from './templates/account-activated'
import { newProjectTemplate } from './templates/new-project'
import { developerStartedWorkTemplate } from './templates/developer-started-work'
import { developerCompletedWorkTemplate } from './templates/developer-completed-work'
import { revisionApprovedTemplate } from './templates/revision-approved'
import { revisionRejectedTemplate } from './templates/revision-rejected'
import { supportRenewalReminderTemplate } from './templates/support-renewal-reminder'
import { loginCredentialsTemplate } from './templates/login-credentials'
import { getBranding, generatePlainText } from './templates/base.template'
import type { BrandingConfig } from './templates/base.template'
import { EMAIL_LOG_PREFIX } from './email.constants'

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Strip carriage returns and newlines from user-supplied strings
 * to prevent email header injection attacks.
 */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, ' ').trim()
}

// ─── Email Validation ───────────────────────────────────────────────────────

/**
 * Simple email address validation regex.
 * Compliant with RFC 5322 for common use cases.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Validate a single email address. Returns true if valid.
 */
function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim())
}

/**
 * Validate one or more email addresses.
 * Logs invalid addresses but does NOT throw — we silently skip invalid ones
 * to ensure email failures never crash the caller.
 *
 * @returns Array of valid email addresses
 */
function validateAddresses(to: string | string[]): string[] {
  const addresses = Array.isArray(to) ? to : [to]
  const valid = addresses.filter(email => {
    if (isValidEmail(email)) return true
    console.warn(`${EMAIL_LOG_PREFIX} Invalid email address skipped: ${email}`)
    return false
  })

  if (valid.length === 0) {
    console.warn(`${EMAIL_LOG_PREFIX} No valid email addresses provided — email will not be sent`)
  }

  return valid
}

function validateOptionalAddresses(cc?: string | string[]): string[] | undefined {
  if (!cc) return undefined
  const valid = validateAddresses(cc)
  return valid.length > 0 ? valid : undefined
}

// ─── Generic Send ───────────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string
  priority?: EmailPriority
  attachments?: EmailAttachment[]
  immediate?: boolean
  /** Business event that produced this email — carried to the provider for
   *  template-aware logging and redaction (e.g. password-reset tokens). */
  eventType?: EmailEventType
}

/**
 * Generic send method — the single entry point for all email sending.
 * Renders HTML, generates plain text fallback, then enqueues for delivery.
 *
 * @returns The email ID (for queued) or send result (for immediate)
 */
function send(options: SendEmailOptions): string | null {
  // Sanitize subject to prevent header injection
  const safeSubject = sanitizeHeader(options.subject)

  // Validate recipient email addresses
  const validTo = validateAddresses(options.to)
  if (validTo.length === 0) {
    return null
  }

  const validCc = validateOptionalAddresses(options.cc)
  const validBcc = validateOptionalAddresses(options.bcc)
  const config = loadSenderConfig()
  const from = buildFromAddress(config)

  const params: SendEmailParams = {
    from,
    to: validTo,
    subject: safeSubject,
    html: options.html,
    text: options.text || generatePlainText(options.html),
    cc: validCc,
    bcc: validBcc,
    replyTo: options.replyTo,
    priority: options.priority || 'normal',
    attachments: options.attachments,
    eventType: options.eventType,
  }

  if (options.immediate) {
    // Fire and forget — we don't await this
    sendImmediately(params).catch((err: Error) => {
      console.error(`${EMAIL_LOG_PREFIX} Immediate send failed silently:`, err.message)
    })
    return 'immediate'
  }

  return enqueue(params)
}

// ─── Helper to resolve branding ─────────────────────────────────────────────

function resolveBranding(branding?: BrandingConfig): BrandingConfig {
  return branding || getBranding()
}

// ─── Ticket Created ─────────────────────────────────────────────────────────

/**
 * Send "Ticket Created" notification to project manager(s).
 */
export function sendTicketCreated(
  to: string | string[],
  data: TicketCreatedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = ticketCreatedTemplate(data, branding)

  return send({
    to,
    subject: `[New Ticket #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'ticket_created',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Ticket Assigned ────────────────────────────────────────────────────────

/**
 * Send "Ticket Assigned" notification to the assigned developer.
 */
export function sendTicketAssigned(
  to: string | string[],
  data: TicketAssignedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = ticketAssignedTemplate(data, branding)

  return send({
    to,
    subject: `[Assigned #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'ticket_assigned',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Estimate Approved ──────────────────────────────────────────────────────

/**
 * Send "Estimate Approved" notification to the project manager.
 */
export function sendEstimateApproved(
  to: string | string[],
  data: EstimateApprovedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = estimateApprovedTemplate(data, branding)

  return send({
    to,
    subject: `[Estimate Approved #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'estimate_approved',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Estimate Rejected ──────────────────────────────────────────────────────

/**
 * Send "Estimate Rejected" notification to the project manager.
 */
export function sendEstimateRejected(
  to: string | string[],
  data: EstimateRejectedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = estimateRejectedTemplate(data, branding)

  return send({
    to,
    subject: `[Estimate Declined #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'estimate_rejected',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Additional Hours ───────────────────────────────────────────────────────

/**
 * Send "Additional Hours Requested" notification to the client.
 */
export function sendAdditionalHours(
  to: string | string[],
  data: AdditionalHoursTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = additionalHoursTemplate(data, branding)

  return send({
    to,
    subject: `[Additional Hours Required #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'additional_hours',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Additional Hours Rejected ──────────────────────────────────────────────

/**
 * Send "Additional Hours Rejected" notification to the project manager.
 */
export function sendAdditionalHoursRejected(
  to: string | string[],
  data: AdditionalHoursRejectedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = additionalHoursRejectedTemplate(data, branding)

  return send({
    to,
    subject: `[Additional Hours Declined #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'additional_hours_rejected',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Ticket Resolved ────────────────────────────────────────────────────────

/**
 * Send "Ticket Resolved" (ready for review) notification to the client.
 */
export function sendTicketResolved(
  to: string | string[],
  data: TicketResolvedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = ticketResolvedTemplate(data, branding)

  return send({
    to,
    subject: `[Ready for Review #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'ticket_resolved',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Ticket Closed ──────────────────────────────────────────────────────────

/**
 * Send "Ticket Closed" notification to the client.
 */
export function sendTicketClosed(
  to: string | string[],
  data: TicketClosedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = ticketClosedTemplate(data, branding)

  return send({
    to,
    subject: `[Closed #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'ticket_closed',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Ticket Reopened ───────────────────────────────────────────────────────

/**
 * Send "Ticket Reopened" notification to assigned developer and manager.
 */
export function sendTicketReopened(
  to: string | string[],
  data: TicketReopenedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = ticketReopenedTemplate(data, branding)

  return send({
    to,
    subject: `[Reopened #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'ticket_reopened',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Ticket Reassigned ──────────────────────────────────────────────────────

/**
 * Send "Ticket Reassigned" notification to the new developer.
 */
export function sendTicketReassigned(
  to: string | string[],
  data: TicketReassignedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = ticketReassignedTemplate(data, branding)

  return send({
    to,
    subject: `[Reassigned #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'ticket_reassigned',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Revision Requested ─────────────────────────────────────────────────────

/**
 * Send "Revision Requested" notification to the assigned developer.
 */
export function sendRevisionRequested(
  to: string | string[],
  data: RevisionRequestedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = revisionRequestedTemplate(data, branding)

  return send({
    to,
    subject: `[Revision Requested #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'revision_requested',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Estimate Requested (to Client) ────────────────────────────────────────

/**
 * Send "Estimate Requested" notification to the client for approval.
 */
export function sendEstimateRequested(
  to: string | string[],
  data: EstimateRequestedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = estimateRequestedTemplate(data, branding)

  return send({
    to,
    subject: `[Estimate Ready #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'estimate_requested',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Additional Hours Approved ──────────────────────────────────────────────

/**
 * Send "Additional Hours Approved" notification to the manager.
 */
export function sendAdditionalHoursApproved(
  to: string | string[],
  data: AdditionalHoursApprovedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = additionalHoursApprovedTemplate(data, branding)

  return send({
    to,
    subject: `[Additional Hours Approved #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'additional_hours_approved',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Wallet Empty ───────────────────────────────────────────────────────────

/**
 * Send "Wallet Empty" alert to the client.
 */
export function sendWalletEmpty(
  to: string | string[],
  data: WalletEmptyTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = walletEmptyTemplate(data, branding)

  return send({
    to,
    subject: `Support Hours Exhausted — ${data.projectName}`,
    html,
    eventType: 'wallet_empty',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Support Hours Added ────────────────────────────────────────────────────

/**
 * Send "Support Hours Added" notification to the client.
 */
export function sendSupportHoursAdded(
  to: string | string[],
  data: SupportHoursAddedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = supportHoursAddedTemplate(data, branding)

  return send({
    to,
    subject: `Support Hours Added — ${data.projectName}`,
    html,
    eventType: 'support_hours_added',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Welcome Email ──────────────────────────────────────────────────────────

/**
 * Send "Welcome" email to a new user.
 */
export function sendWelcomeEmail(
  to: string | string[],
  data: WelcomeTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = welcomeTemplate(data, branding)

  return send({
    to,
    subject: `Welcome to ${branding.companyName}!`,
    html,
    eventType: 'welcome',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Password Reset ─────────────────────────────────────────────────────────

/**
 * Send "Password Reset" email to a user.
 */
export function sendPasswordReset(
  to: string | string[],
  data: PasswordResetTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = passwordResetTemplate(data, branding)

  return send({
    to,
    subject: `Reset Your ${branding.companyName} Password`,
    html,
    eventType: 'password_reset',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Password Reset Requested (Support team) ────────────────────────────────

/**
 * Send "Password Reset Request" notification to Admins / Project Managers
 * (and optionally the configured Support inbox) when a user requests a
 * password reset. Contains only request metadata — never passwords/tokens.
 */
export function sendPasswordResetRequested(
  to: string | string[],
  data: PasswordResetRequestedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = passwordResetRequestedTemplate(data, branding)

  return send({
    to,
    subject: `Password Reset Request — ${data.requesterName || data.requesterEmail}`,
    html,
    eventType: 'password_reset_requested',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Wallet Low ─────────────────────────────────────────────────────────────

/**
 * Send "Wallet Low Balance" alert to a client.
 */
export function sendWalletLow(
  to: string | string[],
  data: WalletLowTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = walletLowTemplate(data, branding)

  return send({
    to,
    subject: `Support Hours Running Low — ${data.projectName}`,
    html,
    eventType: 'wallet_low',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Customer Created ───────────────────────────────────────────────────────

/**
 * Send "Customer Created" notification to the new customer.
 */
export function sendCustomerCreated(
  to: string | string[],
  data: CustomerCreatedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = customerCreatedTemplate(data, branding)

  return send({
    to,
    subject: `Welcome to ${branding.companyName}, ${data.customerName}!`,
    html,
    eventType: 'customer_created',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Account Activated ──────────────────────────────────────────────────────

/**
 * Send "Account Activated" notification to a user.
 */
export function sendAccountActivated(
  to: string | string[],
  data: AccountActivatedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = accountActivatedTemplate(data, branding)

  return send({
    to,
    subject: `Your ${branding.companyName} Account Has Been Activated`,
    html,
    eventType: 'account_activated',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── New Project ─────────────────────────────────────────────────────────────

/**
 * Send "New Project Created" notification to the project manager (and client).
 */
export function sendNewProject(
  to: string | string[],
  data: NewProjectTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = newProjectTemplate(data, branding)

  return send({
    to,
    subject: `[New Project] ${data.projectName}`,
    html,
    eventType: 'new_project',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Developer Started Work ──────────────────────────────────────────────────

/**
 * Send "Developer Started Work" notification to the client and manager.
 */
export function sendDeveloperStartedWork(
  to: string | string[],
  data: DeveloperStartedWorkTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = developerStartedWorkTemplate(data, branding)

  return send({
    to,
    subject: `[Work Started #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'developer_started_work',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Developer Completed Work ────────────────────────────────────────────────

/**
 * Send "Developer Completed Work" notification to the client and manager.
 */
export function sendDeveloperCompletedWork(
  to: string | string[],
  data: DeveloperCompletedWorkTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = developerCompletedWorkTemplate(data, branding)

  return send({
    to,
    subject: `[Work Logged #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'developer_completed_work',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Revision Approved ───────────────────────────────────────────────────────

/**
 * Send "Revision Approved" notification to the requester and developer.
 */
export function sendRevisionApproved(
  to: string | string[],
  data: RevisionApprovedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = revisionApprovedTemplate(data, branding)

  return send({
    to,
    subject: `[Revision Approved #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'revision_approved',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Revision Rejected ───────────────────────────────────────────────────────

/**
 * Send "Revision Rejected" notification to the requester.
 */
export function sendRevisionRejected(
  to: string | string[],
  data: RevisionRejectedTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = revisionRejectedTemplate(data, branding)

  return send({
    to,
    subject: `[Revision Not Approved #${data.ticketNumber}] ${data.ticketTitle}`,
    html,
    eventType: 'revision_rejected',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Support Renewal Reminder ────────────────────────────────────────────────

/**
 * Send "Support Renewal Reminder" notification to a client.
 */
export function sendSupportRenewalReminder(
  to: string | string[],
  data: SupportRenewalReminderTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = supportRenewalReminderTemplate(data, branding)

  return send({
    to,
    subject: `Support Renewal Reminder — ${data.expiryDate ? `expires ${data.expiryDate}` : 'action needed'}`,
    html,
    eventType: 'support_renewal_reminder',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Login Credentials ───────────────────────────────────────────────────────

/**
 * Send "Login Credentials" email to a newly created user (admin opt-in only).
 * Carries the sign-in email + initial password so the user can access the portal.
 */
export function sendLoginCredentials(
  to: string | string[],
  data: LoginCredentialsTemplateData,
  options?: { immediate?: boolean; cc?: string | string[]; branding?: BrandingConfig },
): string | null {
  const branding = resolveBranding(options?.branding)
  const html = loginCredentialsTemplate(data, branding)

  return send({
    to,
    subject: `Your ${branding.companyName} Login Credentials`,
    html,
    eventType: 'login_credentials',
    cc: options?.cc,
    immediate: options?.immediate,
  })
}

// ─── Barrel Re-exports ──────────────────────────────────────────────────────

export type { BrandingConfig } from './templates/base.template'
export { enqueue, getQueueDepth, processQueue, startQueuePolling, stopQueuePolling } from './email.queue'
export { getProvider, getActiveProviderName, registerProvider, listProviders } from './email.provider'
export { getTransporter, verifyTransporter, isTransporterReady, loadSenderConfig, buildFromAddress } from './email.transporter'

export const emailService = {
  sendTicketCreated,
  sendTicketAssigned,
  sendEstimateApproved,
  sendEstimateRejected,
  sendAdditionalHours,
  sendAdditionalHoursRejected,
  sendTicketResolved,
  sendTicketClosed,
  sendTicketReopened,
  sendTicketReassigned,
  sendRevisionRequested,
  sendEstimateRequested,
  sendAdditionalHoursApproved,
  sendWelcomeEmail,
  sendPasswordReset,
  sendPasswordResetRequested,
  sendWalletLow,
  sendWalletEmpty,
  sendSupportHoursAdded,
  sendCustomerCreated,
  sendAccountActivated,
  sendNewProject,
  sendDeveloperStartedWork,
  sendDeveloperCompletedWork,
  sendRevisionApproved,
  sendRevisionRejected,
  sendSupportRenewalReminder,
  sendLoginCredentials,
};