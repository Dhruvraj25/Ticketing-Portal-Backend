// ============================================================================
// Email Template — Welcome Email
// ============================================================================
// Sent to new users when their account is created.

import { baseWrapper, emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { WelcomeTemplateData } from '../email.types'

export function welcomeTemplate(
  data: WelcomeTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Welcome to SupportHub') +
    emailParagraph(`Welcome! We're excited to have you on board. Your account has been created and you can now log in to the SupportHub portal.`) +
    emailFieldTable(
      emailFieldRow('Email', escapeHtml(data.userEmail)),
    ) +
    emailParagraph('Click the button below to log in and get started.') +
    emailButton('Log In to SupportHub', data.loginUrl, branding) +
    emailParagraph('If you have any questions, please contact your system administrator.')

  return baseWrapper(content, branding)
}
