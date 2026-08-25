// ============================================================================
// Email Template — New Project Created
// ============================================================================
// Sent to the project manager (and optionally the client) when a new project
// is created.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { NewProjectTemplateData } from '../email.types'

export function newProjectTemplate(
  data: NewProjectTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('New Project Created') +
    emailParagraph(`A new project <strong>${escapeHtml(data.projectName)}</strong> has been created.`) +
    emailFieldTable(
      emailFieldRow('Project', escapeHtml(data.projectName)) +
      emailFieldRow('Project Code', escapeHtml(data.projectCode)) +
      (data.clientName ? emailFieldRow('Client', escapeHtml(data.clientName)) : '') +
      (data.managerName ? emailFieldRow('Manager', escapeHtml(data.managerName)) : '') +
      (data.startDate ? emailFieldRow('Start Date', escapeHtml(data.startDate)) : ''),
    ) +
    emailParagraph('You can view the project details using the button below.') +
    emailButton('View Project', data.projectLink, branding)

  return baseWrapper(content, branding)
}
