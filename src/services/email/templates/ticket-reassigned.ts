import type { TicketReassignedTemplateData } from '../email.types'
import { emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, baseWrapper } from './base.template'
import type { BrandingConfig } from './base.template'

export function ticketReassignedTemplate(
  data: TicketReassignedTemplateData,
  branding: BrandingConfig,
): string {
  const content =
    emailHeading('Ticket Reassigned') +
    emailParagraph(
      'Ticket #' + data.ticketNumber + ' has been reassigned to you.'
    ) +
    emailFieldTable(
      emailFieldRow('Ticket', '#' + data.ticketNumber) +
      emailFieldRow('Title', data.ticketTitle) +
      emailFieldRow('Assigned By', data.assignedBy) +
      emailFieldRow('Priority', data.priority)
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
