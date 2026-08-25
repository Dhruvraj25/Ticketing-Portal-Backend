// ============================================================================
// Email Template — Login Credentials
// ============================================================================
// Sent when an admin explicitly opts in ("Send login credentials via email")
// during customer onboarding / user creation. Contains the sign-in email and
// the initial password so the new user can access the portal.
//
// Security note: this email carries a plaintext initial password by explicit
// admin choice. Recipients are advised to change it after first login.

import { baseWrapper, emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, emailSmallText, emailInfoBox, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { LoginCredentialsTemplateData } from '../email.types'

export function loginCredentialsTemplate(
  data: LoginCredentialsTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Your SupportHub Login Credentials') +
    emailParagraph(`Hi${data.recipientName ? ' ' + escapeHtml(data.recipientName) : ''}, an account has been created for you on the SupportHub portal. Use the credentials below to sign in.`) +
    emailFieldTable(
      emailFieldRow('Email', escapeHtml(data.userEmail)) +
      emailFieldRow('Password', escapeHtml(data.initialPassword)),
    ) +
    emailButton('Log In to SupportHub', data.loginUrl, branding) +
    (data.resetLink
      ? emailSmallText(`Prefer to set your own password? <a href="${escapeHtml(data.resetLink)}" style="color:#2563EB;text-decoration:underline">Reset your password</a> before signing in.`)
      : '') +
    emailSmallText('For your security, please change this password after your first login and never share it with anyone.') +
    emailInfoBox('If you did not expect this email, please contact your system administrator immediately.')

  return baseWrapper(content, branding)
}
