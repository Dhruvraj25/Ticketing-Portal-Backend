import type { SupportHoursAddedTemplateData } from '../email.types'
import { emailHeading, emailParagraph, emailFieldRow, emailFieldTable, emailButton, baseWrapper } from './base.template'
import type { BrandingConfig } from './base.template'

export function supportHoursAddedTemplate(
  data: SupportHoursAddedTemplateData,
  branding: BrandingConfig,
): string {
  const content =
    emailHeading('Support Hours Added') +
    emailParagraph(
      'Support hours have been added to your wallet for "' + data.projectName + '".'
    ) +
    emailFieldTable(
      emailFieldRow('Hours Added', data.addedHours + 'h') +
      emailFieldRow('New Balance', data.newBalance + 'h')
    ) +
    emailButton('View Wallet', data.walletLink, branding)

  return baseWrapper(content, branding)
}
