// ============================================================================
// Email Template — Ticket Resolved Notification (Ready for Client Review)
// ============================================================================
// Sent to the client when their ticket has been resolved and is ready for review.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { TicketResolvedTemplateData } from '../email.types'

export function ticketResolvedTemplate(
  data: TicketResolvedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Ticket Ready for Review') +
    emailParagraph(`Your ticket has been resolved by <strong>${escapeHtml(data.resolvedBy)}</strong> and is ready for your review.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Resolved By', escapeHtml(data.resolvedBy)) +
      (data.resolutionSummary ? emailFieldRow('Resolution', escapeHtml(data.resolutionSummary)) : ''),
    ) +
    emailButton('Review Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
