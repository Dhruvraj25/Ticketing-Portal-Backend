// ============================================================================
// Email Template — Additional Hours Rejected Notification
// ============================================================================
// Sent to the project manager when the client rejects an additional hours request.
// Includes the ticket details, requested hours, and rejection reason.

import type { AdditionalHoursRejectedTemplateData } from '../email.types'
import { emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, baseWrapper } from './base.template'
import type { BrandingConfig } from './base.template'

export function additionalHoursRejectedTemplate(
  data: AdditionalHoursRejectedTemplateData,
  branding: BrandingConfig,
): string {
  const content =
    emailHeading('Additional Hours Request Declined') +
    emailParagraph(
      'The client has declined the request for additional hours on the following ticket.',
    ) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${data.ticketNumber}`) +
      emailFieldRow('Title', data.ticketTitle) +
      emailFieldRow('Project', data.projectName || '-') +
      emailFieldRow('Requested Hours', `${data.requestedHours}h`) +
      emailFieldRow('Client', data.clientName) +
      emailFieldRow('Reason for Rejection', data.rejectReason),
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
