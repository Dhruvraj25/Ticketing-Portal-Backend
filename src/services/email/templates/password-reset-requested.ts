// ============================================================================
// Email Template — Password Reset Request (Support team notification)
// ============================================================================
// Sent to Admins / Project Managers (and optionally the configured Support
// inbox) when a Client/Developer requests a password reset through the portal.
// Contains ONLY request metadata (name, email, role, time, reference) — never
// passwords or reset tokens.

import { baseWrapper, emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, emailSmallText, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { PasswordResetRequestedTemplateData } from '../email.types'

export function passwordResetRequestedTemplate(
  data: PasswordResetRequestedTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Password Reset Request') +
    emailParagraph(`<strong>${escapeHtml(data.requesterName)}</strong> (<em>${escapeHtml(data.requesterRole)}</em>) has requested a password reset and needs your review.`) +
    emailFieldTable(
      emailFieldRow('User name', escapeHtml(data.requesterName)) +
      emailFieldRow('User email', escapeHtml(data.requesterEmail)) +
      emailFieldRow('User role', escapeHtml(data.requesterRole)) +
      emailFieldRow('Request date/time', escapeHtml(data.requestedAt)) +
      emailFieldRow('Request reference', escapeHtml(data.reference)),
    ) +
    emailParagraph('To set a new password for this user, open User Management, find the user by email, and use the <strong>Reset Password</strong> action. Communicate the new password to the user through a trusted channel.') +
    emailButton('Open User Management', data.adminUrl, branding) +
    emailSmallText('For security reasons, never include passwords in email. Verify the requester before setting a new password.')

  return baseWrapper(content, branding)
}
