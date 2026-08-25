// ============================================================================
// Microsoft Email Provider — DEPRECATED ALIAS (backward compatibility)
// ============================================================================
//
// The real Microsoft 365 email provider lives in microsoft-smtp.provider.ts
// (EMAIL_PROVIDER=microsoft-smtp, OAuth 2.0 / XOAUTH2 via Nodemailer against
// smtp.office365.com:587).
//
// This file is kept so existing imports (`microsoftProvider`,
// `isMicrosoftConfigured`) and existing registrations of the old
// EMAIL_PROVIDER=microsoft name keep working. It is a thin alias that
// delegates to the real SMTP provider.
//
// NOTE: EMAIL_PROVIDER=microsoft is deprecated — it is ambiguous between
// Microsoft Graph and Microsoft 365 SMTP. Use EMAIL_PROVIDER=microsoft-smtp.
// ============================================================================

import type { EmailProvider } from '../email.types'
import { microsoftSmtpProvider, isMicrosoftSmtpConfigured } from './microsoft-smtp.provider'

/**
 * @deprecated Use isMicrosoftSmtpConfigured() from microsoft-smtp.provider.
 * Kept so existing callers keep working.
 */
export function isMicrosoftConfigured(): boolean {
  return isMicrosoftSmtpConfigured()
}

/**
 * @deprecated EMAIL_PROVIDER=microsoft is ambiguous — use microsoft-smtp.
 * Kept for backward compatibility; delegates to the Microsoft 365 SMTP provider.
 */
export const microsoftProvider: EmailProvider = {
  ...microsoftSmtpProvider,
  name: 'microsoft',
}
