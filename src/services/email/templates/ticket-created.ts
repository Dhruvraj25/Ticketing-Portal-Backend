// ============================================================================
// Email Template — Ticket Created Notification
// ============================================================================
// Sent to project manager(s) when a new ticket is created by a client.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { TicketCreatedTemplateData } from '../email.types'

export function ticketCreatedTemplate(
  data: TicketCreatedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('New Ticket Created') +
    emailParagraph(`A new ticket has been created by <strong>${escapeHtml(data.createdBy)}</strong> and requires attention.`) +
    emailFieldTable(
      emailFieldRow('Ticket', `#${escapeHtml(data.ticketNumber)}`) +
      emailFieldRow('Title', escapeHtml(data.ticketTitle)) +
      emailFieldRow('Project', data.projectName ? escapeHtml(data.projectName) : '-') +
      emailFieldRow('Module', data.moduleName ? escapeHtml(data.moduleName) : '-') +
      emailFieldRow('Priority', escapeHtml(data.priority)) +
      emailFieldRow('Created By', escapeHtml(data.createdBy)) +
      emailFieldRow('Date', escapeHtml(data.createdDate)),
    ) +
    emailButton('View Ticket', data.ticketLink, branding)

  return baseWrapper(content, branding)
}
