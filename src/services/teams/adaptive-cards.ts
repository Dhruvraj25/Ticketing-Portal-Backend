// ============================================================================
// Adaptive Card Builder — Teams Notification Cards
// ============================================================================
// Builds Adaptive Card JSON structures for each notification event type.
// Follows the Adaptive Cards v1.5 specification.
// ============================================================================

import type { TeamsNotificationPayload, AdaptiveCard, AdaptiveCardElement, AdaptiveCardAction } from './teams.types'
import { TEAMS_COLORS, EVENT_ICON_MAP } from './teams.constants'

// ─── Helpers ────────────────────────────────────────────────────────────────

function textBlock(text: string, opts?: Record<string, unknown>): AdaptiveCardElement {
  return { type: 'TextBlock', text, wrap: true, ...opts } as AdaptiveCardElement
}

function factSet(facts: { title: string; value: string }[], spacing?: string): AdaptiveCardElement {
  return { type: 'FactSet', facts, ...(spacing && { spacing }) } as AdaptiveCardElement
}

function infoSection(...items: AdaptiveCardElement[]): AdaptiveCardElement {
  return { type: 'Container', items, spacing: 'medium', style: 'emphasis' } as AdaptiveCardElement
}

function warningSection(...items: AdaptiveCardElement[]): AdaptiveCardElement {
  return { type: 'Container', items, spacing: 'medium', style: 'warning' } as AdaptiveCardElement
}

function attentionSection(...items: AdaptiveCardElement[]): AdaptiveCardElement {
  return { type: 'Container', items, spacing: 'medium', style: 'attention' } as AdaptiveCardElement
}

function openUrlAction(title: string, url: string): AdaptiveCardAction {
  return { type: 'Action.OpenUrl', title, url } as AdaptiveCardAction
}

function buildCard(title: string, msg: string, body: AdaptiveCardElement[], url?: string, color?: string): AdaptiveCard {
  const elements: AdaptiveCardElement[] = [
    textBlock(title, { size: 'large', weight: 'bolder' }),
    textBlock(msg, { size: 'default', isSubtle: true, spacing: 'small' }),
    ...body,
  ]
  const card: AdaptiveCard = { type: 'AdaptiveCard', version: '1.5', body: elements, msTeams: { width: 'full' } }
  if (url) card.actions = [openUrlAction('Open in Portal', url)]
  return card
}

function getColor(p: TeamsNotificationPayload): string | undefined {
  return p.color ? TEAMS_COLORS[p.color] : undefined
}

function facts(p: TeamsNotificationPayload): { title: string; value: string }[] {
  const f: { title: string; value: string }[] = []
  if (p.projectName) f.push({ title: 'Project', value: p.projectName })
  if (p.ticketId) f.push({ title: 'Ticket', value: p.ticketId })
  if (p.priority) f.push({ title: 'Priority', value: p.priority })
  if (p.status) f.push({ title: 'Status', value: p.status })
  if (p.clientName) f.push({ title: 'Client', value: p.clientName })
  if (p.assignedTo) f.push({ title: 'Assigned To', value: p.assignedTo })
  if (p.estimateHours) f.push({ title: 'Estimate', value: p.estimateHours })
  if (p.additionalHours) f.push({ title: 'Additional Hours', value: p.additionalHours })
  if (p.createdBy) f.push({ title: 'Created By', value: p.createdBy })
  if (p.developerName) f.push({ title: 'Developer', value: p.developerName })
  if (p.revisionNumber) f.push({ title: 'Revision', value: p.revisionNumber })
  if (p.reason) f.push({ title: 'Reason', value: p.reason })
  if (p.fields) for (const x of p.fields) f.push({ title: x.label, value: x.value })
  return f
}

function getIcon(eventType: string): string {
  return EVENT_ICON_MAP[eventType] || '\uD83D\uDD14'
}

// ─── Ticket Created ─────────────────────────────────────────────────────────

export function newTicketCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.ticketTitle) {
    body.unshift(infoSection(
      textBlock(getIcon('ticket_created') + ' Ticket Details', { size: 'medium', weight: 'bolder' }),
      textBlock(p.ticketTitle, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard('New Ticket ' + (p.ticketId || ''), 'Created by ' + (p.createdBy || 'a user') + '.', body, p.url, getColor(p))
}

// ─── Ticket Updated ────────────────────────────────────────────────────────

export function ticketUpdatedCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.ticketTitle) {
    body.unshift(infoSection(
      textBlock(getIcon('ticket_updated') + ' Updated', { size: 'medium', weight: 'bolder' }),
      textBlock(p.ticketTitle, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard('Ticket Updated ' + (p.ticketId || ''), p.message || 'A ticket has been updated.', body, p.url, getColor(p))
}

// ─── Ticket Assigned ────────────────────────────────────────────────────────

export function ticketAssignedCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.ticketTitle) {
    body.unshift(infoSection(
      textBlock(getIcon('ticket_assigned') + ' Assignment', { size: 'medium', weight: 'bolder' }),
      textBlock(p.ticketTitle, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard('Assigned ' + (p.ticketId || ''), 'Assigned to ' + (p.assignedTo || 'developer') + '.', body, p.url, getColor(p))
}

// ─── Estimate Approval (Request) ───────────────────────────────────────────

export function estimateApprovalCard(p: TeamsNotificationPayload): AdaptiveCard {
  return buildCard('Estimate Ready ' + (p.ticketId || ''), 'Est: ' + (p.estimateHours || 'N/A') + ' \u2014 awaiting approval.', [factSet(facts(p))], p.url, getColor(p))
}

// ─── Estimate Approved ──────────────────────────────────────────────────────

export function estimateApprovedCard(p: TeamsNotificationPayload): AdaptiveCard {
  return buildCard('Estimate Approved ' + (p.ticketId || ''), 'Approved' + (p.estimateHours ? ' (' + p.estimateHours + ')' : '') + '.', [factSet(facts(p))], p.url, getColor(p))
}

// ─── Estimate Rejected ──────────────────────────────────────────────────────

export function estimateRejectedCard(p: TeamsNotificationPayload): AdaptiveCard {
  return buildCard('Estimate Rejected ' + (p.ticketId || ''), 'Rejected' + (p.estimateHours ? ' (' + p.estimateHours + ')' : '') + '.', [factSet(facts(p))], p.url, getColor(p))
}

// ─── Revision Requested ─────────────────────────────────────────────────────

export function revisionRequestedCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.revisionNotes) {
    body.unshift(infoSection(
      textBlock(getIcon('revision_requested') + ' Revision Notes', { size: 'medium', weight: 'bolder' }),
      textBlock(p.revisionNotes, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard('Revision Requested ' + (p.ticketId || ''), 'A revision has been requested.', body, p.url, getColor(p))
}

// ─── Revision Approved ──────────────────────────────────────────────────────

export function revisionApprovedCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.revisionNotes) {
    body.unshift(infoSection(
      textBlock(getIcon('revision_approved') + ' Revision Approved', { size: 'medium', weight: 'bolder' }),
      textBlock(p.revisionNotes, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard(
    'Revision Approved' + (p.ticketId ? ' ' + p.ticketId : ''),
    'Revision' + (p.revisionNumber ? ' #' + p.revisionNumber : '') + ' has been approved.' + (p.approvedBy ? ' by ' + p.approvedBy : '') + '.',
    body, p.url, getColor(p),
  )
}

// ─── Revision Rejected ──────────────────────────────────────────────────────

export function revisionRejectedCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.rejectionReason) {
    body.unshift(attentionSection(
      textBlock(getIcon('revision_rejected') + ' Revision Rejected', { size: 'medium', weight: 'bolder' }),
      textBlock(p.rejectionReason, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard(
    'Revision Rejected' + (p.ticketId ? ' ' + p.ticketId : ''),
    'Revision' + (p.revisionNumber ? ' #' + p.revisionNumber : '') + ' was rejected.' + (p.rejectedBy ? ' by ' + p.rejectedBy : '') + '.',
    body, p.url, getColor(p),
  )
}

// ─── Ticket Resolved ────────────────────────────────────────────────────────

export function ticketResolvedCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.ticketTitle) {
    body.unshift(infoSection(
      textBlock(getIcon('ticket_resolved') + ' Resolution', { size: 'medium', weight: 'bolder' }),
      textBlock(p.ticketTitle, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard('Resolved ' + (p.ticketId || ''), 'Ready for review.', body, p.url, getColor(p))
}

// ─── Ticket Closed ──────────────────────────────────────────────────────────

export function ticketClosedCard(p: TeamsNotificationPayload): AdaptiveCard {
  return buildCard('Closed ' + (p.ticketId || ''), 'Ticket closed.', [factSet(facts(p))], p.url, getColor(p))
}

// ─── Developer Started Work ─────────────────────────────────────────────────

export function developerStartedCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.ticketTitle) {
    body.unshift(infoSection(
      textBlock(getIcon('developer_started_work') + ' Work Started', { size: 'medium', weight: 'bolder' }),
      textBlock(p.ticketTitle, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard(
    'Work Started' + (p.ticketId ? ' ' + p.ticketId : ''),
    (p.developerName || 'A developer') + ' has started work.',
    body, p.url, getColor(p),
  )
}

// ─── Developer Completed Work ──────────────────────────────────────────────

export function developerCompletedCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.ticketTitle) {
    body.unshift(infoSection(
      textBlock(getIcon('developer_completed_work') + ' Work Completed', { size: 'medium', weight: 'bolder' }),
      textBlock(p.ticketTitle, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard(
    'Work Completed' + (p.ticketId ? ' ' + p.ticketId : ''),
    (p.developerName || 'A developer') + ' has completed work.',
    body, p.url, getColor(p),
  )
}

// // ─── Customer Created / Account Activated / Welcome ────────────────────────

// export function customerCreatedCard(p: TeamsNotificationPayload): AdaptiveCard {
//   const body: AdaptiveCardElement[] = [factSet(facts(p))]
//   if (p.clientName) {
//     body.unshift(infoSection(
//       textBlock(getIcon('customer_created') + ' Customer', { size: 'medium', weight: 'bolder' }),
//       textBlock(p.clientName, { size: 'default', isSubtle: true }),
//     ))
//   }
//   return buildCard('New Customer', p.message || 'A new customer has joined.', body, p.url, getColor(p))
// }
// ─── Customer Created ───────────────────────────────────────────────────────

export function customerCreatedCard(
  p: TeamsNotificationPayload
): AdaptiveCard {
  const body: AdaptiveCardElement[] = [
    infoSection(
      textBlock(
        getIcon('customer_created') + ' Customer Created',
        { size: 'medium', weight: 'bolder' }
      ),
      textBlock(
        p.clientName || 'New customer',
        { size: 'default', isSubtle: true }
      ),
    ),
    factSet(facts(p)),
  ]

  return buildCard(
    'Customer Created',
    p.message || 'A new customer has been created.',
    body,
    p.url,
    getColor(p)
  )
}


// ─── Account Activated ──────────────────────────────────────────────────────

export function accountActivatedCard(
  p: TeamsNotificationPayload
): AdaptiveCard {
  const body: AdaptiveCardElement[] = [
    infoSection(
      textBlock(
        getIcon('account_activated') + ' Account Activated',
        { size: 'medium', weight: 'bolder' }
      ),
      textBlock(
        p.clientName || 'Customer account',
        { size: 'default', isSubtle: true }
      ),
    ),
    factSet(facts(p)),
  ]

  return buildCard(
    'Account Activated',
    p.message || 'The customer account has been activated successfully.',
    body,
    p.url,
    getColor(p)
  )
}


// ─── Welcome ────────────────────────────────────────────────────────────────

export function welcomeCard(
  p: TeamsNotificationPayload
): AdaptiveCard {
  const body: AdaptiveCardElement[] = [
    infoSection(
      textBlock(
        getIcon('welcome') + ' Welcome',
        { size: 'medium', weight: 'bolder' }
      ),
      textBlock(
        p.clientName || 'New customer',
        { size: 'default', isSubtle: true }
      ),
    ),
    factSet(facts(p)),
  ]

  return buildCard(
    'Welcome to SupportHub',
    p.message || 'Welcome to SupportHub. Your account is ready to use.',
    body,
    p.url,
    getColor(p)
  )
}
// ─── New Project ────────────────────────────────────────────────────────────

export function newProjectCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.projectName) {
    body.unshift(infoSection(
      textBlock(getIcon('new_project') + ' Project', { size: 'medium', weight: 'bolder' }),
      textBlock(p.projectName, { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard('New Project', p.message || 'A new project has been created.', body, p.url, getColor(p))
}

// ─── Wallet Low ─────────────────────────────────────────────────────────────

export function walletLowCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [
    warningSection(
      textBlock(getIcon('wallet_low') + ' Warning', { size: 'medium', weight: 'bolder' }),
      textBlock('The support wallet balance is running low.', { size: 'default', isSubtle: true }),
    ),
    factSet(facts(p)),
  ]
  return buildCard('Wallet Low', 'Support hours are running low.', body, p.url, getColor(p))
}

// ─── Wallet Empty ───────────────────────────────────────────────────────────

export function walletEmptyCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [
    attentionSection(
      textBlock(getIcon('wallet_empty') + ' Depleted', { size: 'medium', weight: 'bolder' }),
      textBlock('The support wallet is empty. No more support hours available.', { size: 'default', isSubtle: true }),
    ),
    factSet(facts(p)),
  ]
  return buildCard('Wallet Empty', 'Support hours depleted.', body, p.url, getColor(p))
}

// ─── Additional Hours / Support Hours Added ─────────────────────────────────

export function additionalHoursCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.additionalHours || p.estimateHours) {
    body.unshift(infoSection(
      textBlock(getIcon('additional_hours_approved') + ' Hours', { size: 'medium', weight: 'bolder' }),
      textBlock(p.additionalHours ? p.additionalHours + ' hours' : p.estimateHours + ' hours', { size: 'default', isSubtle: true }),
    ))
  }
  return buildCard(
    'Hours Added' + (p.ticketId ? ' ' + p.ticketId : ''),
    p.message || 'Hours have been added.',
    body, p.url, getColor(p),
  )
}

// ─── Support Hours Assigned (wallet recharge) ───────────────────────────────

export function supportHoursAssignedCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.assignedHours || p.remainingBalance) {
    const lines = []
    if (p.assignedHours) lines.push(textBlock('Added: ' + p.assignedHours + 'h', { size: 'default', weight: 'bolder' }))
    if (p.remainingBalance !== undefined) lines.push(textBlock('New balance: ' + p.remainingBalance + 'h', { size: 'default', isSubtle: true }))
    if (p.supportStartDate || p.supportEndDate) {
      lines.push(textBlock(
        'Validity: ' + (p.supportStartDate || '—') + ' to ' + (p.supportEndDate || '—'),
        { size: 'small', isSubtle: true, spacing: 'small' },
      ))
    }
    body.unshift(infoSection(
      textBlock(getIcon('support_hours_added') + ' Support Hours', { size: 'medium', weight: 'bolder' }),
      ...lines,
    ))
  }
  return buildCard(
    'Support Hours Added',
    p.message || 'Support hours have been added to the wallet.',
    body, p.url, getColor(p),
  )
}

// ─── Test Message ───────────────────────────────────────────────────────────

export function testMessageCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [
    infoSection(
      textBlock(getIcon('test_message') + ' Test Notification', { size: 'medium', weight: 'bolder' }),
      textBlock('This is a test message to verify Teams integration.', { size: 'default', isSubtle: true }),
    ),
    factSet(facts(p)),
  ]
  return buildCard(
    p.title || 'Test Message',
    p.message || 'Teams integration test from SupportHub.',
    body, p.url, getColor(p),
  )
}

// ─── Generic / Fallback ─────────────────────────────────────────────────────

export function genericNotificationCard(p: TeamsNotificationPayload): AdaptiveCard {
  const body: AdaptiveCardElement[] = [factSet(facts(p))]
  if (p.message) {
    body.unshift(textBlock(p.message, { size: 'default', isSubtle: true, spacing: 'medium' }))
  }
  return buildCard(p.title || 'Notification', p.message || 'You have a new notification.', body, p.url, getColor(p))
}
