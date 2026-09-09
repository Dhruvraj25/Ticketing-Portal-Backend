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
  // approvedBy is the internal manager/admin's name — this template goes to
  // BOTH the (often-client) requester and the assigned developer, so the
  // caller omits approvedBy for the client/requester copy and it stays
  // optional here. Internal recipients (developer) keep receiving the name.
  const content =
    emailHeading('Revision Approved') +
    emailParagraph(`Revision <strong>#${escapeHtml(String(data.revisionNumber))}</strong> for the ticket below has been approved${data.approvedBy ? ` by ${escapeHtml(data.approvedBy)}` : ''}.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Revision', escapeHtml(String(data.revisionNumber))),
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
