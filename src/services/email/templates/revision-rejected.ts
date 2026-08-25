// ============================================================================
// Email Template — Revision Rejected
// ============================================================================
// Sent to the revision requester when a revision request is rejected.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, emailSmallText, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { RevisionRejectedTemplateData } from '../email.types'

export function revisionRejectedTemplate(
  data: RevisionRejectedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Revision Not Approved') +
    emailParagraph(`Revision <strong>#${escapeHtml(String(data.revisionNumber))}</strong> for the ticket below was rejected.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Revision', escapeHtml(String(data.revisionNumber))),
    ) +
    (data.rejectionReason
      ? emailParagraph(`<strong>Reason:</strong> ${escapeHtml(data.rejectionReason)}`)
      : '') +
    emailSmallText('You can view the ticket for more details.') +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
