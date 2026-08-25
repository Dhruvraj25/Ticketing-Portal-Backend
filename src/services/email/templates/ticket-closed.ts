// ============================================================================
// Email Template — Ticket Closed Notification
// ============================================================================
// Sent to the client when their ticket is closed (either by approval or automatically).

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { TicketClosedTemplateData } from '../email.types'

export function ticketClosedTemplate(
  data: TicketClosedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Ticket Successfully Closed') +
    emailParagraph(`The ticket has been closed by <strong>${escapeHtml(data.closedBy)}</strong>. Thank you for your business!`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      (data.resolutionTime ? emailFieldRow('Resolution Time', escapeHtml(data.resolutionTime)) : ''),
    ) +
    (data.feedbackLink
      ? emailButton('Leave Feedback', data.feedbackLink, branding)
      : '')

  return baseWrapper(content, branding)
}
