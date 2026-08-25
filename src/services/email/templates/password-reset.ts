// ============================================================================
// Email Template — Password Reset
// ============================================================================
// Sent when a user requests a password reset link.

import { baseWrapper, emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, emailSmallText, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { PasswordResetTemplateData } from '../email.types'

export function passwordResetTemplate(
  data: PasswordResetTemplateData,
  branding?: BrandingConfig,
): string {
  const expiryMinutes = data.expiryMinutes || 60

  const content =
    emailHeading('Reset Your Password') +
    emailParagraph(`We received a request to reset the password for your SupportHub account associated with <strong>${escapeHtml(data.userEmail)}</strong>.`) +
    emailParagraph(`Click the button below to reset your password. This link will expire in <strong>${escapeHtml(String(expiryMinutes))} minutes</strong>`) +
    emailButton('Reset Password', data.resetLink, branding) +
    emailSmallText('If you did not request a password reset, please ignore this email. Your password will remain unchanged.') +
    emailSmallText('For security reasons, never share this link with anyone.')

  return baseWrapper(content, branding)
}
