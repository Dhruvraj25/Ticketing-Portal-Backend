// ============================================================================
// Email Template — Account Activated Notification
// ============================================================================
// Sent to a user when their account has been activated by an administrator.

import { baseWrapper, emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { AccountActivatedTemplateData } from '../email.types'

export function accountActivatedTemplate(
  data: AccountActivatedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Account Activated') +
    emailParagraph(`Dear <strong>${escapeHtml(data.userName)}</strong>, your SupportHub account has been activated. You can now log in using the credentials you registered with.`) +
    emailFieldTable(
      emailFieldRow('Email', escapeHtml(data.userEmail)),
    ) +
    emailParagraph('Click the button below to log in and access the SupportHub portal.') +
    emailButton('Log In', data.loginUrl, branding)

  return baseWrapper(content, branding)
}
