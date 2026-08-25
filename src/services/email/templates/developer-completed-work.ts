// ============================================================================
// Email Template — Developer Completed Work
// ============================================================================
// Sent to the client and project manager when a developer completes a work
// session on a ticket.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { DeveloperCompletedWorkTemplateData } from '../email.types'

export function developerCompletedWorkTemplate(
  data: DeveloperCompletedWorkTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Work Session Completed') +
    emailParagraph(`A work session on the ticket below has been logged.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      (data.developerName ? emailFieldRow('Developer', escapeHtml(data.developerName)) : '') +
      (data.durationMinutes != null
        ? emailFieldRow('Duration', `${escapeHtml(String(data.durationMinutes))} minutes`)
        : ''),
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
