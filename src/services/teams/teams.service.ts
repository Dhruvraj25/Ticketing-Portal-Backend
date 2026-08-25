// ============================================================================
// Teams Service — Notification Orchestration
// ============================================================================
// Primary entry point for sending Teams notifications.
// Routes events to the correct Adaptive Card template and dispatches via
// the queue system.
//
// All methods are fire-and-forget — they never block the caller.
// All errors are caught and logged.
// ============================================================================

import { TEAMS_LOG_PREFIX, EVENT_COLOR_MAP } from './teams.constants'
import { loadTeamsConfig, sendWebhookMessageMock } from './teams-webhook-client'
import { enqueue } from './teams-queue'
import { teamsMonitor } from './teams-monitor'
import {
  newTicketCard,
  ticketUpdatedCard,
  ticketAssignedCard,
  estimateApprovalCard,
  estimateApprovedCard,
  estimateRejectedCard,
  revisionRequestedCard,
  revisionApprovedCard,
  revisionRejectedCard,
  ticketResolvedCard,
  ticketClosedCard,
  developerStartedCard,
  developerCompletedCard,
  customerCreatedCard,
  newProjectCard,
  walletLowCard,
  walletEmptyCard,
  additionalHoursCard,
  supportHoursAssignedCard,
  testMessageCard,
  genericNotificationCard,
} from './adaptive-cards'
import type { TeamsNotificationPayload, TeamsSendResult, AdaptiveCard, AdaptiveCardElement, TeamsMention } from './teams.types'

// ─── Core Notification Method ───────────────────────────────────────────────

export function sendTeamsNotification(eventType: string, payload: TeamsNotificationPayload): void {
  const config = loadTeamsConfig()
  const mention = buildMention(payload)

  if (!config.enabled) {
    // Mock mode — log and simulate delivery
    console.log('')
    console.log('='.repeat(60))
    console.log('Teams Notification (Mock Mode — Webhook)')
    console.log('')
    console.log('Event:    ' + (payload.title || eventType))
    console.log('Project:  ' + (payload.projectName || 'N/A'))
    console.log('Ticket:   ' + (payload.ticketId || 'N/A'))
    console.log('Webhook:  Not configured')
    console.log('Status:   Simulated')
    console.log('='.repeat(60))
    console.log('')

    // Send via mock (non-queued for simplicity in dev mode)
    const card = buildAdaptiveCard(eventType, payload)
    if (card) {
      const cardWithMention = mention ? addMentionToCard(card, mention) : card
      sendWebhookMessageMock(config, '', '', cardWithMention as unknown as Record<string, unknown>, mention).catch(function () {})
    }
    return
  }

  const card = buildAdaptiveCard(eventType, payload)
  if (!card) {
    console.warn(TEAMS_LOG_PREFIX + ' No card template for event: ' + eventType)
    return
  }

  const cardWithMention = mention ? addMentionToCard(card, mention) : card

  // Queue for delivery via webhook
  enqueue(eventType as any, payload as unknown as Record<string, unknown>, cardWithMention, '', '', mention)
  teamsMonitor.recordQueueEvent('Queued: ' + eventType)
  console.log(TEAMS_LOG_PREFIX + ' Queued notification: ' + eventType)
}

/**
 * Build a Teams mention from the payload's recipient info (when available).
 * The mention renders as a highlighted pill for the recipient in Teams.
 */
export function buildMention(payload: TeamsNotificationPayload): TeamsMention | null {
  const name = (payload.recipientName || '').trim()
  const id = (payload.recipientEmail || '').trim()
  if (!name || !id) return null
  return { name, id }
}

/**
 * Prepend a greeting TextBlock containing the <at>mention</at> to the card,
 * so Teams resolves the mention entity declared at the webhook payload root.
 */
function addMentionToCard(card: AdaptiveCard, mention: TeamsMention): AdaptiveCard {
  const copy: AdaptiveCard = { ...card, body: card.body ? [...card.body] : [] }
  copy.body.unshift({
    type: 'TextBlock',
    text: 'Hi <at>' + mention.name + '</at>,',
    size: 'default',
    weight: 'bolder',
    spacing: 'none',
  } as AdaptiveCardElement)
  return copy
}

export function buildAdaptiveCard(eventType: string, payload: TeamsNotificationPayload): AdaptiveCard | null {
  switch (eventType) {
    case 'ticket_created':
    case 'ticket_reopened':
      return newTicketCard(payload)
    case 'ticket_updated':
      return ticketUpdatedCard(payload)
    case 'ticket_assigned':
    case 'ticket_reassigned':
      return ticketAssignedCard(payload)
    case 'estimate_requested':
    case 'additional_hours_requested':
      return estimateApprovalCard(payload)
    case 'estimate_approved':
    case 'additional_hours_approved':
      return estimateApprovedCard(payload)
    case 'estimate_rejected':
    case 'additional_hours_rejected':
      return estimateRejectedCard(payload)
    case 'revision_requested':
      return revisionRequestedCard(payload)
    case 'revision_approved':
      return revisionApprovedCard(payload)
    case 'revision_rejected':
      return revisionRejectedCard(payload)
    case 'ticket_resolved':
      return ticketResolvedCard(payload)
    case 'ticket_closed':
      return ticketClosedCard(payload)
    case 'developer_started_work':
      return developerStartedCard(payload)
    case 'developer_completed_work':
      return developerCompletedCard(payload)
    case 'customer_created':
    case 'account_activated':
    case 'welcome':
      return customerCreatedCard(payload)
    case 'new_project':
      return newProjectCard(payload)
    case 'wallet_low':
      return walletLowCard(payload)
    case 'wallet_empty':
      return walletEmptyCard(payload)
    case 'support_hours_added':
    case 'support_hours_assigned':
      return supportHoursAssignedCard(payload)
    case 'test_message':
      return testMessageCard(payload)
    default:
      return genericNotificationCard(payload)
  }
}

function logPayload(eventType: string, payload: TeamsNotificationPayload): void {
  console.log(TEAMS_LOG_PREFIX + ' Payload: ' + JSON.stringify({
    event: eventType,
    title: payload.title,
    message: payload.message,
    project: payload.projectName,
    ticket: payload.ticketId,
    client: payload.clientName,
    hasUrl: !!payload.url,
  }, null, 2))
}

// ─── Named Event Methods ────────────────────────────────────────────────────

function buildPayload(title: string, message: string, extra?: Partial<TeamsNotificationPayload>): TeamsNotificationPayload {
  return {
    id: 'teams_' + Date.now(),
    eventType: 'ticket_created' as any,
    title,
    message,
    ...extra,
  }
}

export function sendTicketCreated(
  recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('ticket_created', buildPayload(
    'New Ticket ' + (payload.ticketId || ''),
    'A new ticket has been created.',
    { ...payload, assignedTo: recipientName },
  ))
}

export function sendTicketUpdated(
  recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('ticket_updated', buildPayload(
    'Ticket Updated ' + (payload.ticketId || ''),
    payload.message || 'A ticket has been updated.',
    { ...payload, assignedTo: recipientName },
  ))
}

export function sendTicketAssigned(
  recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('ticket_assigned', buildPayload(
    'Ticket Assigned ' + (payload.ticketId || ''),
    'A ticket has been assigned to you.',
    { ...payload, assignedTo: recipientName },
  ))
}

export function sendEstimateRequest(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('estimate_requested', buildPayload(
    'Estimate Ready ' + (payload.ticketId || ''),
    'An estimate is awaiting your approval.',
    payload,
  ))
}

export function sendEstimateApproved(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('estimate_approved', buildPayload(
    'Estimate Approved ' + (payload.ticketId || ''),
    'The estimate has been approved.',
    payload,
  ))
}

export function sendEstimateRejected(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('estimate_rejected', buildPayload(
    'Estimate Rejected ' + (payload.ticketId || ''),
    'The estimate has been rejected.',
    payload,
  ))
}

export function sendRevisionRequested(
  recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('revision_requested', buildPayload(
    'Revision Requested ' + (payload.ticketId || ''),
    'A revision has been requested.',
    { ...payload, assignedTo: recipientName },
  ))
}

export function sendTicketResolved(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('ticket_resolved', buildPayload(
    'Ticket Resolved ' + (payload.ticketId || ''),
    'A ticket has been resolved and is ready for review.',
    payload,
  ))
}

export function sendTicketClosed(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('ticket_closed', buildPayload(
    'Ticket Closed ' + (payload.ticketId || ''),
    'Ticket has been closed.',
    payload,
  ))
}

export function sendTicketReopened(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('ticket_reopened', buildPayload(
    'Ticket Reopened ' + (payload.ticketId || ''),
    'A ticket has been reopened.',
    payload,
  ))
}

export function sendDeveloperStarted(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('developer_started_work', buildPayload(
    'Work Started ' + (payload.ticketId || ''),
    (payload.developerName || 'A developer') + ' has started work.',
    payload,
  ))
}

export function sendDeveloperCompleted(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('developer_completed_work', buildPayload(
    'Work Completed ' + (payload.ticketId || ''),
    (payload.developerName || 'A developer') + ' has completed work.',
    payload,
  ))
}

export function sendCustomerCreated(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('customer_created', buildPayload(
    'New Customer',
    'A new customer has been created.',
    payload,
  ))
}

export function sendNewProject(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('new_project', buildPayload(
    'New Project',
    'A new project has been created.',
    payload,
  ))
}

export function sendWalletLow(
  recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('wallet_low', buildPayload(
    'Wallet Low',
    'Support wallet is running low.',
    { ...payload, assignedTo: recipientName },
  ))
}

export function sendWalletEmpty(
  recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('wallet_empty', buildPayload(
    'Wallet Empty',
    'Support wallet is empty.',
    { ...payload, assignedTo: recipientName },
  ))
}

export function sendAdditionalHours(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('additional_hours_requested', buildPayload(
    'Additional Hours Requested' + (payload.ticketId ? ' ' + payload.ticketId : ''),
    'Additional hours have been requested.',
    payload,
  ))
}

export function sendAdditionalHoursApproved(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('additional_hours_approved', buildPayload(
    'Additional Hours Approved' + (payload.ticketId ? ' ' + payload.ticketId : ''),
    'Additional hours have been approved.',
    payload,
  ))
}

export function sendAdditionalHoursRejected(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('additional_hours_rejected', buildPayload(
    'Additional Hours Rejected' + (payload.ticketId ? ' ' + payload.ticketId : ''),
    'Additional hours have been rejected.',
    payload,
  ))
}

export function sendSupportHoursAdded(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('support_hours_added', buildPayload(
    'Support Hours Added',
    'Support hours have been added to the wallet.',
    payload,
  ))
}

export function sendPasswordReset(
  _recipientName: string,
  payload: Partial<TeamsNotificationPayload>,
): void {
  sendTeamsNotification('password_reset', buildPayload(
    'Password Reset',
    'A password reset has been completed.',
    payload,
  ))
}

export function sendTestMessage(payload: Partial<TeamsNotificationPayload>): void {
  sendTeamsNotification('test_message', buildPayload(
    payload.title || 'Test Message',
    payload.message || 'This is a test notification from SupportHub.',
    payload,
  ))
}
