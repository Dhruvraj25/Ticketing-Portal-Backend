import type { RevisionRequestedTemplateData } from '../email.types'
import { emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, baseWrapper } from './base.template'
import type { BrandingConfig } from './base.template'

export function revisionRequestedTemplate(
  data: RevisionRequestedTemplateData,
  branding: BrandingConfig,
): string {
  const content =
    emailHeading('Revision Requested') +
    emailParagraph(
      'A revision has been requested for ticket #' + data.ticketNumber + '.'
    ) +
    emailFieldTable(
      emailFieldRow('Ticket', '#' + data.ticketNumber) +
      emailFieldRow('Title', data.ticketTitle) +
      emailFieldRow('Requested By', data.requestedByName) +
      emailFieldRow('Notes', data.revisionNotes)
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
