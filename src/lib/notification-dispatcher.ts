// ============================================================================
// Notification Dispatcher — Unified Event Routing
// ============================================================================
// Routes application events to the In-App, Email and Teams channels through a
// SINGLE pipeline:
//
//   business event
//     → dispatchUserNotification(recipient, eventType, payload)
//     → check the recipient's per-event preference for each channel (#14)
//     → create In-App notification  (when enabled)
//     → send Email                  (when enabled AND an email template exists)
//     → send Teams                  (when enabled AND Teams is configured)
//
// The backend is the source of truth for business events — business operations
// never depend on the frontend remembering to send an email or Teams message.
// The frontend may still call the notification bridge endpoints for events it
// originates; those routes enforce the same preferences (see
// routes/email-notification.ts and routes/teams-notification.ts).
//
// Channel defaults preserve existing behavior (see lib/notification-preferences.ts):
//   - In-App / Email default ON
//   - Teams default: client users follow the customer-level
//     enable_teams_notifications flag (OFF unless enabled); internal staff ON.
//   Teams dispatch is graceful: disabled/unconfigured → no-op, never throws.
// ============================================================================

import {
  sendTicketCreated as emailTicketCreated,
  sendTicketAssigned as emailTicketAssigned,
  sendTicketReassigned as emailTicketReassigned,
  sendTicketResolved as emailTicketResolved,
  sendTicketClosed as emailTicketClosed,
  sendCustomerCreated as emailCustomerCreated,
  sendAccountActivated as emailAccountActivated,
  sendEstimateApproved as emailEstimateApproved,
  sendEstimateRejected as emailEstimateRejected,
  sendAdditionalHours as emailAdditionalHours,
  sendAdditionalHoursApproved as emailAdditionalHoursApproved,
  sendAdditionalHoursRejected as emailAdditionalHoursRejected,
  sendWalletLow as emailWalletLow,
  sendWalletEmpty as emailWalletEmpty,
  sendSupportHoursAdded as emailSupportHoursAdded,
  sendTicketReopened as emailTicketReopened,
  sendEstimateRequested as emailEstimateRequested,
  sendRevisionRequested as emailRevisionRequested,
} from '../services/email/email.service'
import { sendTeamsNotification } from '../services/teams/teams.service'
import { loadTeamsConfig } from '../services/teams/teams-webhook-client'
import type { TeamsNotificationPayload, TeamsEventType } from '../services/teams/teams.types'
import { EVENT_COLOR_MAP } from '../services/teams/teams.constants'
import { EMAIL_LOG_PREFIX } from '../services/email/email.constants'
import { getFrontendUrl } from '../utils/frontend-url'
import * as notificationService from '../services/notification.service'
import * as prefRepo from '../repositories/notification-preference.repository'
import {
  canonicalNotificationEvent,
  indexPreferences,
  isNotificationEnabled,
  type NotificationChannel,
} from './notification-preferences'

const PORTAL_URL = getFrontendUrl()

export type NotificationChannelType = NotificationChannel | 'all'

export interface DispatchOptions {
  channels?: NotificationChannelType[]
  email?: { cc?: string | string[]; bcc?: string | string[]; immediate?: boolean }
}

export interface NotificationEventPayload {
  email: string | string[]
  title: string
  message: string
  eventType: string
  projectName?: string
  ticketNumber?: string
  ticketTitle?: string
  clientName?: string
  assignedTo?: string
  developerName?: string
  revisionNotes?: string
  estimateHours?: number
  additionalHours?: number
  priority?: string
  status?: string
  createdBy?: string
  url?: string
  fields?: { label: string; value: string }[]
}

/**
 * A server-resolved notification recipient. Recipients are ALWAYS resolved
 * from the database by role/project/tenant rules — never trusted from the
 * request body (Requirement #10).
 */
export interface DispatchRecipient {
  id: string
  name: string
  email: string
  role: string
  enableTeamsNotifications?: boolean
}

// ─── Email / Teams event spelling per canonical preference key ─────────────
// A canonical key may map to a different raw eventType for each channel
// (e.g. preference "client_review" sends the email/Teams event "ticket_resolved").
const EMAIL_EVENT_BY_PREFERENCE: Record<string, string> = {
  client_review: 'ticket_resolved',
  request_for_revision: 'revision_requested',
  ticket_reassigned: 'ticket_reassigned',
}

const TEAMS_EVENT_BY_PREFERENCE: Record<string, string> = {
  client_review: 'ticket_resolved',
  request_for_revision: 'revision_requested',
  manager_review: 'developer_completed_work',
}

/** Email events the dispatcher knows how to render. */
const EMAIL_CAPABLE_EVENTS = new Set([
  'ticket_created',
  'ticket_assigned',
  'ticket_reassigned',
  'ticket_resolved',
  'ticket_closed',
  'ticket_reopened',
  'customer_created',
  'account_activated',
  'estimate_requested',
  'estimate_approved',
  'estimate_rejected',
  'revision_requested',
  'additional_hours_requested',
  'additional_hours_approved',
  'additional_hours_rejected',
  'wallet_low',
  'wallet_empty',
  'support_hours_added',
])

// ─── Teams helpers ─────────────────────────────────────────────────────────

let _teamsEnabled: boolean | null = null

function isTeamsConfigured(): boolean {
  if (_teamsEnabled === null) {
    const config = loadTeamsConfig()
    _teamsEnabled = config.enabled && !!config.webhookUrl
  }
  return _teamsEnabled
}

function toTeamsPayload(
  eventType: string,
  payload: NotificationEventPayload,
  recipient?: DispatchRecipient,
): TeamsNotificationPayload {
  return {
    id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    eventType: (eventType || 'ticket_created') as TeamsEventType,
    title: payload.title,
    message: payload.message,
    projectName: payload.projectName,
    ticketId: payload.ticketNumber ? '#' + payload.ticketNumber : undefined,
    ticketTitle: payload.ticketTitle,
    clientName: payload.clientName,
    assignedTo: payload.assignedTo,
    developerName: payload.developerName,
    revisionNotes: payload.revisionNotes,
    estimateHours: payload.estimateHours ? payload.estimateHours + 'h' : undefined,
    additionalHours: payload.additionalHours ? payload.additionalHours + 'h' : undefined,
    priority: payload.priority,
    status: payload.status,
    createdBy: payload.createdBy,
    url: payload.url,
    color: (EVENT_COLOR_MAP[eventType] || 'default') as any,
    fields: payload.fields,
    ...(recipient
      ? {
          recipientUserId: recipient.id,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
        }
      : {}),
  }
}

function sendTeamsNotificationInternal(
  eventType: string,
  payload: NotificationEventPayload,
  recipient?: DispatchRecipient,
): void {
  try {
    const teamsPayload = toTeamsPayload(eventType, payload, recipient)
    sendTeamsNotification(eventType, teamsPayload)
  } catch (err) {
    console.error(EMAIL_LOG_PREFIX + ' Teams dispatch error: ' + (err instanceof Error ? err.message : String(err)))
  }
}

// ─── Email helpers ─────────────────────────────────────────────────────────

async function sendEmailNotification(
  eventType: string,
  payload: NotificationEventPayload,
  emailOpts?: { cc?: string | string[]; immediate?: boolean },
): Promise<void> {
  const opts = { cc: emailOpts?.cc, immediate: emailOpts?.immediate ?? false }
  const to = payload.email

  switch (eventType) {
    case 'ticket_created':
      emailTicketCreated(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        projectName: payload.projectName,
        priority: payload.priority || 'normal',
        createdBy: payload.createdBy || '',
        createdDate: new Date().toISOString(),
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'ticket_assigned':
      emailTicketAssigned(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        clientName: payload.clientName || '',
        developerName: payload.assignedTo,
        projectName: payload.projectName,
        priority: payload.priority || 'normal',
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'ticket_reassigned':
      emailTicketReassigned(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        assignedBy: payload.createdBy || '',
        newDeveloper: payload.assignedTo || '',
        priority: payload.priority || 'normal',
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'ticket_resolved':
      emailTicketResolved(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        resolvedBy: payload.createdBy || '',
        resolutionSummary: payload.message,
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'ticket_closed':
      emailTicketClosed(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        closedBy: payload.createdBy || '',
        resolutionTime: payload.estimateHours ? payload.estimateHours + 'h' : undefined,
        feedbackLink: payload.url,
      }, opts)
      break

    case 'ticket_reopened':
      emailTicketReopened(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        reopenedBy: payload.createdBy || '',
        reopenReason: payload.message,
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'customer_created':
      emailCustomerCreated(to, {
        customerName: payload.clientName || '',
        customerEmail: typeof to === 'string' ? to : to[0],
        projectName: payload.projectName,
        createdBy: payload.createdBy || '',
        portalUrl: `${PORTAL_URL}/sign-in`,
      }, opts)
      break

    case 'account_activated':
      emailAccountActivated(to, {
        userEmail: typeof to === 'string' ? to : to[0],
        userName: payload.clientName || '',
        loginUrl: `${PORTAL_URL}/sign-in`,
      }, opts)
      break

    case 'estimate_requested':
      emailEstimateRequested(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        estimatedHours: payload.estimateHours || 0,
        estimateNotes: payload.message,
        approvalDeadline: '',
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'estimate_approved':
      emailEstimateApproved(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        estimatedHours: payload.estimateHours || 0,
        approvedBy: payload.clientName || '',
        managerName: payload.assignedTo,
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'estimate_rejected':
      emailEstimateRejected(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        estimatedHours: payload.estimateHours || 0,
        rejectReason: payload.message,
        rejectedBy: payload.clientName || '',
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'revision_requested':
      emailRevisionRequested(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        requestedByName: payload.createdBy || '',
        revisionNotes: payload.revisionNotes || '',
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'additional_hours_requested':
      emailAdditionalHours(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        requestedHours: payload.additionalHours || 0,
        reason: payload.message,
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'additional_hours_approved':
      emailAdditionalHoursApproved(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        requestedHours: payload.additionalHours || 0,
        approvedBy: payload.assignedTo || '',
        newTotalHours: payload.estimateHours || 0,
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'additional_hours_rejected':
      emailAdditionalHoursRejected(to, {
        ticketNumber: payload.ticketNumber || '',
        ticketTitle: payload.ticketTitle || '',
        requestedHours: payload.additionalHours || 0,
        clientName: payload.clientName || '',
        rejectReason: payload.message,
        ticketLink: payload.url || '',
      }, opts)
      break

    case 'wallet_low':
      emailWalletLow(to, {
        clientName: payload.clientName || payload.projectName || '',
        projectName: payload.projectName || '',
        remainingHours: payload.estimateHours || 0,
        threshold: 5,
        walletLink: payload.url || '',
      }, opts)
      break

    case 'wallet_empty':
      emailWalletEmpty(to, {
        clientName: payload.clientName || payload.projectName || '',
        projectName: payload.projectName || '',
        walletLink: payload.url || '',
      }, opts)
      break

    case 'support_hours_added':
      emailSupportHoursAdded(to, {
        clientName: payload.clientName || payload.projectName || '',
        projectName: payload.projectName || '',
        addedHours: payload.additionalHours || 0,
        newBalance: payload.estimateHours || 0,
        walletLink: payload.url || '',
      }, opts)
      break

    default:
      console.log(EMAIL_LOG_PREFIX + ' Unknown event type: ' + eventType)
      break
  }
}

// ─── Public dispatch API ───────────────────────────────────────────────────

export interface DispatchUserNotificationOptions {
  /** In-app bell content. Omit (or set null) to send no in-app notification. */
  inApp?: { title: string; message: string; link?: string; ticketId?: number } | null
  /** Explicitly enable/disable the email channel (default: enabled when an email event exists). */
  email?: boolean
  /** Explicitly enable/disable the Teams channel (default: enabled when Teams configured). */
  teams?: boolean
  /** Preloaded preference index (userId → rows) to avoid extra queries in loops. */
  prefIndex?: Map<string, Map<string, boolean>>
  /** Recipient-level cc for the email. */
  cc?: string | string[]
}

/**
 * Preference-aware, centralized dispatch of one notification event to ONE
 * server-resolved recipient across the In-App / Email / Teams channels.
 *
 * Fire-and-forget friendly: never throws to the caller; channel failures are
 * logged. Callers should still `.catch()` when invoking without await.
 */
export async function dispatchUserNotification(
  recipient: DispatchRecipient,
  eventType: string,
  payload: NotificationEventPayload,
  options: DispatchUserNotificationOptions = {},
): Promise<void> {
  try {
    const canonical = canonicalNotificationEvent(eventType) || eventType

    // Preference index for this recipient (or reuse the caller's preloaded map).
    let rowsForUser: Map<string, boolean> | undefined = options.prefIndex?.get(recipient.id)
    if (rowsForUser === undefined) {
      const rows = await prefRepo.findByUserId(recipient.id)
      rowsForUser = indexPreferences(rows)
    }
    const prefUser = {
      role: recipient.role,
      enableTeamsNotifications: recipient.enableTeamsNotifications ?? false,
    }

    const userPayload: NotificationEventPayload = { ...payload, email: recipient.email, eventType: canonical }

    // ── In-App channel ────────────────────────────────────────────────────
    if (options.inApp && options.inApp !== null) {
      const enabled = isNotificationEnabled(rowsForUser, 'in_app', canonical, prefUser)
      if (enabled) {
        // Preference already checked above — omit eventType so the service does
        // not re-query. Other callers still get the service-level guard.
        await notificationService.createNotification({
          userId: recipient.id,
          title: options.inApp.title,
          message: options.inApp.message,
          link: options.inApp.link,
          ticketId: options.inApp.ticketId,
        })
      }
    }

    // ── Email channel ─────────────────────────────────────────────────────
    const emailEvent = EMAIL_EVENT_BY_PREFERENCE[canonical] || canonical
    const emailWanted = options.email !== false && EMAIL_CAPABLE_EVENTS.has(emailEvent)
    if (emailWanted) {
      const enabled = isNotificationEnabled(rowsForUser, 'email', canonical, prefUser)
      if (enabled) {
        await sendEmailNotification(emailEvent, userPayload, { cc: options.cc })
      }
    }

    // ── Teams channel ─────────────────────────────────────────────────────
    const teamsWanted = options.teams !== false
    if (teamsWanted) {
      const enabled = isNotificationEnabled(rowsForUser, 'teams', canonical, prefUser)
      if (enabled && isTeamsConfigured()) {
        const teamsEvent = TEAMS_EVENT_BY_PREFERENCE[canonical] || canonical
        sendTeamsNotificationInternal(teamsEvent, userPayload, recipient)
      }
    }
  } catch (err) {
    // Never let a notification failure break the underlying business operation.
    console.error(EMAIL_LOG_PREFIX + ' dispatchUserNotification error: ' + (err instanceof Error ? err.message : String(err)))
  }
}

// ─── Legacy API (kept for compatibility) ───────────────────────────────────
// The old `dispatch` / `NotificationDispatcher.notify` routed email + Teams
// without recipient preference checks. New code should use
// `dispatchUserNotification`. Existing callers keep working.

export const NotificationDispatcher = {
  notify(
    eventType: string,
    payload: NotificationEventPayload,
    options?: DispatchOptions,
  ): void {
    const channels = options?.channels || ['email', 'teams']

    if (channels.includes('email') || channels.includes('all')) {
      sendEmailNotification(eventType, payload, options?.email).catch((err: Error) => {
        console.error(EMAIL_LOG_PREFIX + ' Dispatch email error: ' + err.message)
      })
    }

    if (channels.includes('teams') || channels.includes('all')) {
      sendTeamsNotificationInternal(eventType, payload)
    }
  },

  refreshTeamsStatus(): void {
    _teamsEnabled = null
  },
}

export function dispatch(
  eventType: string,
  payload: NotificationEventPayload,
  options?: DispatchOptions,
): void {
  NotificationDispatcher.notify(eventType, payload, options)
}
