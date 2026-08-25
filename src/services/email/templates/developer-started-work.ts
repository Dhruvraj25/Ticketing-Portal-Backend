// ============================================================================
// Email Template — Developer Started Work
// ============================================================================
// Sent to the client and project manager when a developer begins working on
// a ticket.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { DeveloperStartedWorkTemplateData } from '../email.types'

export function developerStartedWorkTemplate(
  data: DeveloperStartedWorkTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Work Has Started') +
    emailParagraph(`The assigned developer has started working on your ticket.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      (data.developerName ? emailFieldRow('Developer', escapeHtml(data.developerName)) : '') +
      (data.description ? emailFieldRow('Details', escapeHtml(data.description)) : ''),
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
