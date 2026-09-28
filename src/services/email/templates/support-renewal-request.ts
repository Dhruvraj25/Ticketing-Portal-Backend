// ============================================================================
// Email Template — Support Renewal Request
// ============================================================================
// Sent to the client's Project Manager when the client clicks "Renew Now" on
// the Client Dashboard, asking for additional hours / renewal assistance.

import { baseWrapper, emailHeading, emailParagraph, emailFieldTable, emailFieldRow, emailButton, escapeHtml } from './base.template'
import type { BrandingConfig } from './base.template'
import type { SupportRenewalRequestTemplateData } from '../email.types'

export function supportRenewalRequestTemplate(
  data: SupportRenewalRequestTemplateData,
  branding?: BrandingConfig,
): string {
  const reasons = [
    data.isExpired ? 'The support contract has expired.' : null,
    data.isExpiring ? 'The support contract is expiring soon.' : null,
    data.isLowHours ? 'The support hour balance is running low.' : null,
  ].filter(Boolean)

  const requester = data.customerCompanyName
    ? `${escapeHtml(data.clientName)} (${escapeHtml(data.customerCompanyName)})`
    : escapeHtml(data.clientName)

  const content =
    emailHeading('Support Renewal Request') +
    emailParagraph(`${requester} has requested additional support hours / renewal assistance.`) +
    (reasons.length > 0 ? emailParagraph(reasons.map(r => `• ${r}`).join('<br />')) : '') +
    emailFieldTable(
      emailFieldRow('Client', escapeHtml(data.clientName)) +
      emailFieldRow('Client Email', escapeHtml(data.clientEmail)) +
      (data.customerCompanyName ? emailFieldRow('Company', escapeHtml(data.customerCompanyName)) : '') +
      (data.projectNames.length > 0 ? emailFieldRow('Project(s)', escapeHtml(data.projectNames.join(', '))) : '') +
      (data.remainingHours != null ? emailFieldRow('Remaining Hours', escapeHtml(String(data.remainingHours))) : '') +
      (data.totalPurchasedHours != null ? emailFieldRow('Total Purchased Hours', escapeHtml(String(data.totalPurchasedHours))) : '') +
      (data.expiryDate ? emailFieldRow('Contract End Date', escapeHtml(data.expiryDate)) : ''),
    ) +
    emailParagraph('Please contact the client to arrange the renewal or additional hours.') +
    emailButton('View Support Wallet', data.walletLink, branding)

  return baseWrapper(content, branding)
}
