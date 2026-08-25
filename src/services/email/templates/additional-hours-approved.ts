import type { AdditionalHoursApprovedTemplateData } from '../email.types'
import { emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, baseWrapper } from './base.template'
import type { BrandingConfig } from './base.template'

export function additionalHoursApprovedTemplate(
  data: AdditionalHoursApprovedTemplateData,
  branding: BrandingConfig,
): string {
  const content =
    emailHeading('Additional Hours Approved') +
    emailParagraph(
      'The client has approved additional hours for ticket #' + data.ticketNumber + '.'
    ) +
    emailFieldTable(
      emailFieldRow('Ticket', '#' + data.ticketNumber) +
      emailFieldRow('Title', data.ticketTitle) +
      emailFieldRow('Additional Hours', data.requestedHours + 'h') +
      emailFieldRow('Total Estimate', data.newTotalHours + 'h') +
      emailFieldRow('Approved By', data.approvedBy)
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
