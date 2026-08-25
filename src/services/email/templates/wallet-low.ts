// ============================================================================
// Email Template — Wallet Low Balance Alert
// ============================================================================
// Sent to a client when their support wallet balance drops below the threshold.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { WalletLowTemplateData } from '../email.types'

export function walletLowTemplate(
  data: WalletLowTemplateData,
  branding?: BrandingConfig,
): string {
  const content =
    emailHeading('Support Hours Running Low') +
    emailParagraph(`Your support wallet for project <strong>${escapeHtml(data.projectName)}</strong> is running low on hours.`) +
    emailFieldTable(
      emailFieldRow('Project', escapeHtml(data.projectName)) +
      emailFieldRow('Remaining Hours', `${escapeHtml(data.remainingHours)}h`) +
      emailFieldRow('Threshold', `${escapeHtml(data.threshold)}h`),
    ) +
    emailParagraph('Please consider purchasing additional support hours to avoid any interruption in service.') +
    emailButton('View Wallet', data.walletLink, branding)

  return baseWrapper(content, branding)
}
