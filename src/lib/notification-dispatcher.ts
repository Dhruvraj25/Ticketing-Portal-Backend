// ============================================================================
// Notification Dispatcher — Unified Event Routing
// ============================================================================
// Routes application events to both email and Teams notification channels.
// Uses the same event type strings for both channels.
//
// Architecture:
//   dispatch(eventType, payload, options)
//   -> email: send via email service (always)
//   -> teams: send via teams service (if configured)
//
// All 17 notification events are supported for both channels.
// ============================================================================

import {
  sendTicketCreated as emailTicketCreated,
  sendTicketAssigned as emailTicketAssigned,
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
  sendTicketReassigned as emailTicketReassigned,
  sendEstimateRequested as emailEstimateRequested,
  sendRevisionRequested as emailRevisionRequested,
} from '../services/email/email.service'
import { sendTeamsNotification } from '../services/teams/teams.service'
import type { TeamsNotificationPayload, TeamsEventType } from '../services/teams/teams.types'
import { EVENT_COLOR_MAP } from '../services/teams/teams.constants'
import { loadTeamsConfig } from '../services/teams/teams-webhook-client'
import { EMAIL_LOG_PREFIX } from '../services/email/email.constants'

export type NotificationChannel = 'email' | 'teams' | 'all'

export interface DispatchOptions {
  channels?: NotificationChannel[]
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

let _teamsEnabled: boolean | null = null

function isTeamsAvailable(): boolean {
  if (_teamsEnabled === null) {
    const config = loadTeamsConfig()
    _teamsEnabled = config.enabled && !!config.webhookUrl
  }
  return _teamsEnabled
}

function toTeamsPayload(
  eventType: string,
  payload: NotificationEventPayload,
  additionalMsg?: string,
): TeamsNotificationPayload {
  return {
    id: 'n_' + Date.now(),
    eventType: eventType as TeamsEventType,
    title: payload.title,
    message: additionalMsg || payload.message,
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
  }
}

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

function sendTeamsNotificationInternal(
  eventType: string,
  payload: NotificationEventPayload,
): void {
  try {
    const teamsPayload = toTeamsPayload(eventType, payload)
    sendTeamsNotification(eventType, teamsPayload)
  } catch (err) {
    console.error(EMAIL_LOG_PREFIX + ' Teams dispatch error: ' + (err instanceof Error ? err.message : String(err)))
  }
}

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
    case 'ticket_reassigned':
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
        portalUrl: payload.url || '',
      }, opts)
      break

    case 'account_activated':
      emailAccountActivated(to, {
        userEmail: typeof to === 'string' ? to : to[0],
        userName: payload.clientName || '',
        loginUrl: payload.url || '',
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
        projectName: payload.projectName || '',
        remainingHours: payload.estimateHours || 0,
        threshold: 5,
        walletLink: payload.url || '',
      }, opts)
      break

    case 'wallet_empty':
      emailWalletEmpty(to, {
        projectName: payload.projectName || '',
        walletLink: payload.url || '',
      }, opts)
      break

    case 'support_hours_added':
      emailSupportHoursAdded(to, {
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
