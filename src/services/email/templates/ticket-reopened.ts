import type { TicketReopenedTemplateData } from '../email.types'
import { emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, baseWrapper } from './base.template'
import type { BrandingConfig } from './base.template'

export function ticketReopenedTemplate(
  data: TicketReopenedTemplateData,
  branding: BrandingConfig,
): string {
  const content =
    emailHeading('Ticket Reopened') +
    emailParagraph(
      'Ticket #' + data.ticketNumber + ' has been reopened by ' + data.reopenedBy + '.'
    ) +
    emailFieldTable(
      emailFieldRow('Ticket', '#' + data.ticketNumber) +
      emailFieldRow('Title', data.ticketTitle) +
      emailFieldRow('Reopened By', data.reopenedBy) +
      emailFieldRow('Reason', data.reopenReason)
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
