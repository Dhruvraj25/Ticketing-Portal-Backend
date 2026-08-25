// ============================================================================
// Email Template — Estimate Approved Notification
// ============================================================================
// Sent to the project manager and/or developer when the client approves an estimate.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { EstimateApprovedTemplateData } from '../email.types'

export function estimateApprovedTemplate(
  data: EstimateApprovedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Estimate Approved') +
    emailParagraph(`The client <strong>${escapeHtml(data.approvedBy)}</strong> has approved the estimate. Work can now proceed.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Estimated Hours', `${escapeHtml(data.estimatedHours)}h`) +
      emailFieldRow('Approved By', escapeHtml(data.approvedBy)) +
      (data.managerName ? emailFieldRow('Manager', escapeHtml(data.managerName)) : ''),
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
