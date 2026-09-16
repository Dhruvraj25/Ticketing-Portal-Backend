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
import { enqueue } from './teams-queue'
import { resolveTeamsChannelForProject, getProjectTeamsMembers } from './teams-channel-resolver'
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
  const card = buildAdaptiveCard(eventType, payload)
  if (!card) {
    console.warn(TEAMS_LOG_PREFIX + ' No card template for event: ' + eventType)
    return
  }

  const mention = buildMention(payload)
  const cardWithMention = mention ? addMentionToCard(card, mention) : card

  // Resolve the PROJECT's Teams channel (falling back to the global webhook,
  // then to mock mode) before handing off to the queue. The lookup is async but
  // this function stays fire-and-forget — callers are never blocked.
  //
  // Only an EXPLICIT projectId triggers a DB lookup. Name-based resolution is
  // done once at the boundary (routes/teams-notification.ts, which resolves a
  // ticket number / unique project name to an id) — re-resolving by name here
  // would add a query to every notification and could route a notification to
  // the wrong project when names collide across clients.
  resolveTeamsChannelForProject({ projectId: payload.projectId })
    .then(async function (resolved) {
      // Resolve this project's @mention target + members ONCE, before
      // enqueueing, so every retry mentions the same people (see
      // teams-queue.ts). A project with no Team ID/Channel ID configured
      // (the vast majority) resolves to zero members with no error — this is
      // the normal, expected "no mentions configured" state, not a failure.
      let mentionTarget: { teamId: string; channelId: string } | null = null
      let mentionMembers: import('./teams.types').GraphTeamsMember[] = []
      if (resolved.projectId && resolved.enabled) {
        try {
          const memberResult = await getProjectTeamsMembers(resolved.projectId)
          if (memberResult.target) {
            mentionTarget = memberResult.target
            mentionMembers = memberResult.members
            if (memberResult.error) {
              // Message delivery is NOT blocked by this — the queue falls
              // back to the plain webhook post. Only log, never throw.
              console.warn(
                TEAMS_LOG_PREFIX + ' Member lookup failed for project ' + resolved.projectId +
                ' — message will still be sent, without mentions: ' + memberResult.error.message,
              )
            } else if (mentionMembers.length === 0) {
              console.log(TEAMS_LOG_PREFIX + ' Project ' + resolved.projectId + ' Teams channel has zero members — sending without mentions.')
            }
          }
        } catch (err) {
          // Fail safe: member resolution must never block message delivery.
          console.warn(
            TEAMS_LOG_PREFIX + ' Member resolution threw for project ' + resolved.projectId +
            ' — proceeding without mentions: ' + (err instanceof Error ? err.message : String(err)),
          )
        }
      }

      // Queue for delivery — the queue owns retry/backoff and never re-resolves
      // the destination, so each project's notification keeps its own channel
      // across retries.
      enqueue(
        eventType as any,
        payload as unknown as Record<string, unknown>,
        cardWithMention,
        payload.teamId || '',
        payload.channelId || '',
        mention,
        resolved.webhookUrl,
        resolved.projectId,
        // The destination is authoritative: even when it resolved to nothing,
        // the queue must not fall back to a global webhook the project opted out of.
        true,
        mentionTarget,
        mentionMembers,
      )
      teamsMonitor.recordQueueEvent(
        'Queued: ' + eventType +
        ' [' + resolved.source + (resolved.projectId ? ' project=' + resolved.projectId : '') +
        (mentionTarget ? ' mentions=' + mentionMembers.length : '') + ']',
      )
      // Never log the webhook URL (secret) — only the routing source.
      console.log(
        TEAMS_LOG_PREFIX + ' Queued notification: ' + eventType +
        ' (route: ' + resolved.source + (resolved.projectId ? ', project ' + resolved.projectId : '') + ')',
      )
    })
    .catch(function (err: Error) {
      // Fire-and-forget: never surface a delivery problem to the business caller.
      console.error(TEAMS_LOG_PREFIX + ' Failed to enqueue notification: ' + err.message)
    })
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
    payload.message || 'This is a test notification from Support Hero.',
    payload,
  ))
}
