import type { WalletEmptyTemplateData } from '../email.types'
import { emailHeading, emailParagraph, emailButton, baseWrapper } from './base.template'
import type { BrandingConfig } from './base.template'

export function walletEmptyTemplate(
  data: WalletEmptyTemplateData,
  branding: BrandingConfig,
): string {
  const content =
    emailHeading('Support Hours Exhausted') +
    emailParagraph(
      `Your support wallet for "${data.projectName}" has been fully exhausted. No support hours remain.`
    ) +
    emailParagraph(
      'To continue receiving support, please purchase additional hours at your earliest convenience.'
    ) +
    emailButton('Recharge Wallet', data.walletLink, branding)

  return baseWrapper(content, branding)
}
