// ============================================================================
// Email Template — Manager Review Notification (internal)
// ============================================================================
// Sent to the project manager/admin when a developer marks a ticket resolved.
// The ticket is NOT yet visible to the client — the manager must Forward to
// Client or send it back for Rework first.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { ManagerReviewTemplateData } from '../email.types'

export function managerReviewTemplate(
  data: ManagerReviewTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Ticket Ready for Your Review') +
    emailParagraph(`<strong>${escapeHtml(data.resolvedByName)}</strong> marked this ticket resolved. Review the work and either forward it to the client or send it back for rework.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Resolved By', escapeHtml(data.resolvedByName)),
    ) +
    emailButton('Review Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
