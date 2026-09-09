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
  // This template is client-only (sent when a manager forwards a resolved
  // ticket for client review) — resolvedBy is the internal manager/PM's name
  // and MUST NOT be rendered to the client. It stays optional so an internal
  // caller could still supply it if this template is ever reused elsewhere.
  const content =
    emailHeading('Ticket Ready for Review') +
    emailParagraph(`Your ticket has been resolved${data.resolvedBy ? ` by <strong>${escapeHtml(data.resolvedBy)}</strong>` : ''} and is ready for your review.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      (data.resolvedBy ? emailFieldRow('Resolved By', escapeHtml(data.resolvedBy)) : '') +
      (data.resolutionSummary ? emailFieldRow('Resolution', escapeHtml(data.resolutionSummary)) : ''),
    ) +
    emailButton('Review Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
