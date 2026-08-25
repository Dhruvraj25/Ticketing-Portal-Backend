// ============================================================================
// Email Template — Customer Created Notification
// ============================================================================
// Sent to the new customer and/or admin when a new customer account is created.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { CustomerCreatedTemplateData } from '../email.types'

export function customerCreatedTemplate(
  data: CustomerCreatedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Welcome, New Customer!') +
    emailParagraph(`Dear <strong>${escapeHtml(data.customerName)}</strong>, your customer account has been created successfully by ${escapeHtml(data.createdBy)}.`) +
    emailFieldTable(
      emailFieldRow('Name', escapeHtml(data.customerName)) +
      emailFieldRow('Email', escapeHtml(data.customerEmail)) +
      (data.projectName ? emailFieldRow('Project', escapeHtml(data.projectName)) : ''),
    ) +
    emailParagraph('You can now log in to the SupportHub portal to track your tickets, review estimates, and manage your support requests.') +
    emailButton('Go to Portal', data.portalUrl, branding)

  return baseWrapper(content, branding)
}
