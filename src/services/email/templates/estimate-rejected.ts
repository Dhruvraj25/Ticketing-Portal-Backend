// ============================================================================
// Email Template — Estimate Rejected Notification
// ============================================================================
// Sent to the project manager when the client rejects an estimate.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { EstimateRejectedTemplateData } from '../email.types'

export function estimateRejectedTemplate(
  data: EstimateRejectedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Estimate Declined') +
    emailParagraph(`The client <strong>${escapeHtml(data.rejectedBy)}</strong> has declined the estimate. Please review the feedback and resubmit if needed.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Estimated Hours', `${escapeHtml(data.estimatedHours)}h`) +
      emailFieldRow('Declined By', escapeHtml(data.rejectedBy)) +
      emailFieldRow('Reason', escapeHtml(data.rejectReason)),
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
