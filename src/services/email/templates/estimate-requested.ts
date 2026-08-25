import type { EstimateRequestedTemplateData } from '../email.types'
import { emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, emailInfoBox, baseWrapper } from './base.template'
import type { BrandingConfig } from './base.template'

export function estimateRequestedTemplate(
  data: EstimateRequestedTemplateData,
  branding: BrandingConfig,
): string {
  const content =
    emailHeading('Estimate Ready for Your Approval') +
    emailParagraph(
      'An estimate has been submitted for ticket #' + data.ticketNumber + '. Please review and approve it before the deadline.'
    ) +
    emailFieldTable(
      emailFieldRow('Ticket', '#' + data.ticketNumber) +
      emailFieldRow('Title', data.ticketTitle) +
      emailFieldRow('Estimated Hours', data.estimatedHours + 'h') +
      emailFieldRow('Deadline', data.approvalDeadline)
    ) +
    emailInfoBox(data.estimateNotes) +
    emailButton('Review & Approve', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
