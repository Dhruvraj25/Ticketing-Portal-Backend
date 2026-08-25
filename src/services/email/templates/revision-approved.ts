// ============================================================================
// Email Template — Revision Approved
// ============================================================================
// Sent to the revision requester and the assigned developer when a revision
// request is approved.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { RevisionApprovedTemplateData } from '../email.types'

export function revisionApprovedTemplate(
  data: RevisionApprovedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Revision Approved') +
    emailParagraph(`Revision <strong>#${escapeHtml(String(data.revisionNumber))}</strong> for the ticket below has been approved by ${escapeHtml(data.approvedBy)}.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Revision', escapeHtml(String(data.revisionNumber))),
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
