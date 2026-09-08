// ============================================================================
// Email Template — Rework Notification (internal)
// ============================================================================
// Sent to the assigned developer when a manager/admin sends a resolved ticket
// back for Rework. Distinct from Revision Requested, which is client-initiated
// (see templates/revision-requested.ts) — never shown to the client.

import { baseWrapper, emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { ReworkTemplateData } from '../email.types'

export function reworkTemplate(
  data: ReworkTemplateData,
  branding: BrandingConfig,
): string {
  const content =
    emailHeading('Rework Requested') +
    emailParagraph(
      `<strong>${escapeHtml(data.requestedByName)}</strong> sent ticket #${escapeHtml(data.ticketNumber)} back for rework before it goes to the client.`,
    ) +
    emailFieldTable(
      emailFieldRow('Ticket', '#' + escapeHtml(data.ticketNumber)) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Requested By', escapeHtml(data.requestedByName)) +
      emailFieldRow('Notes', escapeHtml(data.revisionNotes)),
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
