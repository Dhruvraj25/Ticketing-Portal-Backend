// ============================================================================
// Email Template — Support Renewal Reminder
// ============================================================================
// Sent to clients when their support contract is low on hours or expiring.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { SupportRenewalReminderTemplateData } from '../email.types'

export function supportRenewalReminderTemplate(
  data: SupportRenewalReminderTemplateData,
  branding?: BrandingConfig,
): string {
  const reasons = [
    data.isLowHours ? 'Your support hour balance is running low.' : null,
    data.isExpiring ? `Your support contract expires in ${data.daysToExpiry ?? ''} days.` : null,
    data.isExpired ? 'Your support contract has expired.' : null,
  ].filter(Boolean)

  const reasonText = reasons.length > 0
    ? reasons.map(r => `• ${r}`).join('<br />')
    : 'Your support contract requires attention.'

  const content =
    emailHeading('Support Renewal Reminder') +
    emailParagraph(reasonText) +
    emailFieldTable(
      (data.remainingHours != null ? emailFieldRow('Remaining Hours', escapeHtml(String(data.remainingHours))) : '') +
      (data.expiryDate ? emailFieldRow('Contract End Date', escapeHtml(data.expiryDate)) : ''),
    ) +
    emailParagraph('Renew your support package to keep receiving uninterrupted support.') +
    emailButton('View Support Wallet', data.walletLink, branding)

  return baseWrapper(content, branding)
}
