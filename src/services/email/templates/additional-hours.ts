// ============================================================================
// Email Template — Additional Hours Requested Notification
// ============================================================================
// Sent to the client when additional support hours are needed for a ticket.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { AdditionalHoursTemplateData } from '../email.types'

export function additionalHoursTemplate(
  data: AdditionalHoursTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Additional Support Hours Required') +
    emailParagraph('Additional hours are required to complete the work on the following ticket. Please review and approve the request.') +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Additional Hours', `${escapeHtml(data.requestedHours)}h`) +
      (data.currentBalance !== undefined ? emailFieldRow('Current Balance', `${escapeHtml(data.currentBalance)}h`) : '') +
      (data.reason ? emailFieldRow('Reason', escapeHtml(data.reason)) : ''),
    ) +
    emailButton('View Request', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
