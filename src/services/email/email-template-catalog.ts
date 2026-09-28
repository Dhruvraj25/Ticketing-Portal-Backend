// ============================================================================
// Email Template Catalog — Admin → Email Management (read-only)
// ============================================================================
// Describes the EXISTING sender functions in email.service.ts (event type,
// label, documented recipient). Previews are produced by calling the real
// sender inside captureEmailPreview(), so subject + body come from the actual
// production code path — no template or subject is duplicated here.
// Templates are TypeScript code, so they are viewable but not editable.
// ============================================================================

import * as svc from './email.service'
import { captureEmailPreview } from './email.service'
import { baseWrapper, getBranding } from './templates/base.template'
import { withFrontendLinks } from '../../utils/frontend-url'
import { GLOBAL_TEMPLATE_VARIABLES, getActiveTemplateOverride, renderTemplateOverride } from './email-template-overrides'

type Sender = (to: string, data: any) => unknown

export interface TemplateCatalogEntry {
  eventType: string
  label: string
  /** Who receives it — as documented on the sender in email.service.ts. */
  recipient: string
  send: Sender
}

export const EMAIL_TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  { eventType: 'ticket_created', label: 'Ticket Created', recipient: 'Project Manager(s)', send: svc.sendTicketCreated },
  { eventType: 'ticket_assigned', label: 'Ticket Assigned', recipient: 'Assigned developer', send: svc.sendTicketAssigned },
  { eventType: 'ticket_reassigned', label: 'Ticket Reassigned', recipient: 'New developer', send: svc.sendTicketReassigned },
  { eventType: 'manager_review', label: 'Manager Review', recipient: 'Project Manager / Admin', send: svc.sendManagerReview },
  { eventType: 'ticket_resolved', label: 'Ticket Resolved (Ready for Review)', recipient: 'Client', send: svc.sendTicketResolved },
  { eventType: 'ticket_closed', label: 'Ticket Closed', recipient: 'Client', send: svc.sendTicketClosed },
  { eventType: 'ticket_reopened', label: 'Ticket Reopened', recipient: 'Assigned developer and manager', send: svc.sendTicketReopened },
  { eventType: 'estimate_requested', label: 'Estimate Submitted (for Approval)', recipient: 'Client', send: svc.sendEstimateRequested },
  { eventType: 'estimate_approved', label: 'Estimate Approved', recipient: 'Project Manager', send: svc.sendEstimateApproved },
  { eventType: 'estimate_rejected', label: 'Estimate Declined', recipient: 'Project Manager', send: svc.sendEstimateRejected },
  { eventType: 'revision_requested', label: 'Revision Requested', recipient: 'Assigned developer', send: svc.sendRevisionRequested },
  { eventType: 'revision_approved', label: 'Revision Approved', recipient: 'Requester and developer', send: svc.sendRevisionApproved },
  { eventType: 'revision_rejected', label: 'Revision Not Approved', recipient: 'Requester', send: svc.sendRevisionRejected },
  { eventType: 'rework', label: 'Rework Requested', recipient: 'Assigned developer', send: svc.sendRework },
  { eventType: 'additional_hours', label: 'Additional Hours Requested', recipient: 'Client', send: svc.sendAdditionalHours },
  { eventType: 'additional_hours_approved', label: 'Additional Hours Approved', recipient: 'Project Manager', send: svc.sendAdditionalHoursApproved },
  { eventType: 'additional_hours_rejected', label: 'Additional Hours Declined', recipient: 'Project Manager', send: svc.sendAdditionalHoursRejected },
  { eventType: 'developer_started_work', label: 'Developer Started Work', recipient: 'Client and manager', send: svc.sendDeveloperStartedWork },
  { eventType: 'developer_completed_work', label: 'Developer Completed Work', recipient: 'Client and manager', send: svc.sendDeveloperCompletedWork },
  { eventType: 'wallet_low', label: 'Wallet Low Balance', recipient: 'Client', send: svc.sendWalletLow },
  { eventType: 'wallet_empty', label: 'Wallet Empty', recipient: 'Client', send: svc.sendWalletEmpty },
  { eventType: 'support_hours_added', label: 'Support Hours Added', recipient: 'Client', send: svc.sendSupportHoursAdded },
  { eventType: 'support_renewal_reminder', label: 'Support Renewal Reminder', recipient: 'Client', send: svc.sendSupportRenewalReminder },
  { eventType: 'support_renewal_request', label: 'Support Renewal Request', recipient: "Client's Project Manager", send: svc.sendSupportRenewalRequest },
  { eventType: 'new_project', label: 'New Project Created', recipient: 'Project Manager (and client)', send: svc.sendNewProject },
  { eventType: 'customer_created', label: 'Customer Created', recipient: 'New customer', send: svc.sendCustomerCreated },
  { eventType: 'account_activated', label: 'Account Activated', recipient: 'User', send: svc.sendAccountActivated },
  { eventType: 'welcome', label: 'Welcome', recipient: 'New user', send: svc.sendWelcomeEmail },
  { eventType: 'login_credentials', label: 'Login Credentials', recipient: 'Newly created user (admin opt-in)', send: svc.sendLoginCredentials },
  { eventType: 'password_reset', label: 'Password Reset', recipient: 'User', send: svc.sendPasswordReset },
  { eventType: 'password_reset_requested', label: 'Password Reset Request', recipient: 'Admins / Project Managers', send: svc.sendPasswordResetRequested },
]

// ─── Preview ────────────────────────────────────────────────────────────────
// Sample values for common fields; any other field renders as {{fieldName}}
// so the preview shows exactly which variables the template consumes.

const PORTAL = 'https://portal.example.com'
const SAMPLE: Record<string, unknown> = {
  ticketNumber: 'TKT-1001',
  ticketTitle: 'Login page not loading',
  projectName: 'Customer Portal',
  projectNames: ['Customer Portal'],
  clientName: 'Acme Ltd',
  customerName: 'Acme Ltd',
  customerCompanyName: 'Acme Ltd',
  recipientName: 'Alex Morgan',
  recipientEmail: 'alex@example.com',
  userName: 'Alex Morgan',
  userEmail: 'alex@example.com',
  customerEmail: 'alex@example.com',
  clientEmail: 'alex@example.com',
  requesterName: 'Alex Morgan',
  requesterEmail: 'alex@example.com',
  developerName: 'Sam Lee',
  assignedTo: 'Sam Lee',
  newDeveloper: 'Sam Lee',
  managerName: 'Priya Shah',
  createdBy: 'Alex Morgan',
  priority: 'high',
  estimatedHours: 8,
  requestedHours: 4,
  additionalHours: 4,
  newTotalHours: 12,
  remainingHours: 5,
  totalPurchasedHours: 100,
  addedHours: 20,
  newBalance: 25,
  threshold: 5,
  daysToExpiry: 14,
  expiryDate: '2026-12-31',
  revisionNumber: 1,
  createdDate: '2026-09-25T10:00:00.000Z',
  ticketLink: `${PORTAL}/dashboard/tickets/1001`,
  walletLink: `${PORTAL}/dashboard/wallets/1`,
  projectLink: `${PORTAL}/dashboard/projects/1`,
  loginUrl: `${PORTAL}/sign-in`,
  portalUrl: PORTAL,
  resetLink: `${PORTAL}/reset-password?token=EXAMPLE`,
  feedbackLink: `${PORTAL}/dashboard/tickets/1001`,
  adminUrl: `${PORTAL}/dashboard/admin`,
}

const isFlag = (key: string) => /^is[A-Z]/.test(key)

/** Sample-value data (safe, fake values). Unknown fields render as {{field}}. */
function trackingData(used: Set<string>): object {
  return new Proxy(SAMPLE, {
    get(target, key) {
      if (typeof key !== 'string' || key === 'then' || key === 'toJSON') return undefined
      used.add(key)
      if (key in target) return target[key]
      if (key === 'companyName') return getBranding().companyName
      if (isFlag(key)) return true
      return `{{${key}}}`
    },
    has() {
      return true
    },
  })
}

/** Placeholder data: every field renders as its own {{field}} token (editor defaults). */
function placeholderData(used: Set<string>): object {
  return new Proxy(SAMPLE, {
    get(target, key) {
      if (typeof key !== 'string' || key === 'then' || key === 'toJSON') return undefined
      used.add(key)
      if (isFlag(key)) return true
      if (Array.isArray(target[key])) return [`{{${key}}}`]
      return `{{${key}}}`
    },
    has() {
      return true
    },
  })
}

export function findCatalogEntry(eventType: string): TemplateCatalogEntry | undefined {
  return EMAIL_TEMPLATE_CATALOG.find((e) => e.eventType === eventType)
}

/** Strip the branded baseWrapper shell, returning only the editable content. */
function innerContent(fullHtml: string): string | null {
  const MARK = '@@EMAIL_CONTENT@@'
  const shell = baseWrapper(MARK, getBranding())
  const [prefix, suffix] = shell.split(MARK)
  if (prefix === undefined || suffix === undefined) return null
  if (!fullHtml.startsWith(prefix) || !fullHtml.endsWith(suffix)) return null
  return fullHtml.slice(prefix.length, fullHtml.length - suffix.length).trim()
}

export interface CodeTemplateDefinition {
  subject: string
  htmlBody: string
  /** Data fields this template actually receives (the only allowed placeholders, plus companyName). */
  variables: string[]
}

/**
 * The built-in CODE template for an event (never an admin override), expressed
 * with {{placeholders}} — used to prefill the editor and to define which
 * variables that template supports. Derived by running the real template.
 */
export function getCodeTemplateDefinition(eventType: string): CodeTemplateDefinition | null {
  const entry = findCatalogEntry(eventType)
  if (!entry) return null
  const used = new Set<string>()
  let params = null
  try {
    params = captureEmailPreview(() => { entry.send('recipient@example.com', placeholderData(used)) }, { codeTemplate: true })
  } catch {
    params = null
  }
  // Variables = the real data fields the template reads (booleans are layout
  // flags, not printable values). Fall back to a sample render for the list.
  if (used.size === 0) {
    captureEmailPreview(() => { entry.send('recipient@example.com', trackingData(used)) }, { codeTemplate: true })
  }
  const variables = [...new Set([...used].filter((k) => !isFlag(k)).concat(GLOBAL_TEMPLATE_VARIABLES))].sort()
  return {
    subject: params?.subject ?? '',
    htmlBody: (params && innerContent(params.html)) ?? '',
    variables,
  }
}

export interface TemplatePreview {
  eventType: string
  label: string
  recipient: string
  subject: string
  html: string
  variables: string[]
  /** true when an admin-customized template produced this preview. */
  customized: boolean
}

/**
 * Preview exactly what would be sent (active customized template if any, else
 * the code template) using SAMPLE data. Runs the real sender inside
 * captureEmailPreview, so nothing is queued or sent.
 */
export function renderTemplatePreview(eventType: string): TemplatePreview | null {
  const entry = findCatalogEntry(eventType)
  if (!entry) return null
  const params = captureEmailPreview(() => {
    entry.send('recipient@example.com', trackingData(new Set()))
  })
  if (!params) return null
  return {
    eventType: entry.eventType,
    label: entry.label,
    recipient: entry.recipient,
    subject: params.subject,
    html: params.html,
    variables: getCodeTemplateDefinition(eventType)?.variables ?? [],
    customized: !!getActiveTemplateOverride(eventType),
  }
}

/** Preview an UNSAVED draft with sample data (editor "Preview"). Never sends. */
export function renderDraftPreview(
  eventType: string,
  draft: { subject: string; htmlBody: string; textBody?: string | null },
): { subject: string; html: string; text: string | null } | null {
  if (!findCatalogEntry(eventType)) return null
  const rendered = renderTemplateOverride(
    { subject: draft.subject, htmlBody: draft.htmlBody, textBody: draft.textBody ?? null },
    // Same link rule as real emails: application links use FRONTEND_URL.
    withFrontendLinks(trackingData(new Set())),
  )
  return { subject: rendered.subject, html: rendered.html, text: rendered.text ?? null }
}
