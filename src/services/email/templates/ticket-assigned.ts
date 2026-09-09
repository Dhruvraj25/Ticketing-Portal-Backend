// ============================================================================
// Email Template — Ticket Assigned Notification
// ============================================================================
// Sent to the assigned developer when a ticket is assigned to them.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { TicketAssignedTemplateData } from '../email.types'

export function ticketAssignedTemplate(
  data: TicketAssignedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('New Ticket Assigned') +
    // developerName is intentionally omitted from the CLIENT recipient's copy
    // (see Frontend/app/actions/tickets/update.ts's assignTicket) — the
    // fallback text below must stay client-safe (never "you", which would
    // wrongly imply the client themselves was assigned).
    emailParagraph(`A ticket has been assigned to ${data.developerName ? `<strong>${escapeHtml(data.developerName)}</strong>` : 'a developer on our support team'}.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Client', escapeHtml(data.clientName)) +
      emailFieldRow('Project', data.projectName ? escapeHtml(data.projectName) : '-') +
      emailFieldRow('Priority', escapeHtml(data.priority)) +
      emailFieldRow('Due Date', data.dueDate ? escapeHtml(data.dueDate) : '-'),
    ) +
    emailButton('View Assigned Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
