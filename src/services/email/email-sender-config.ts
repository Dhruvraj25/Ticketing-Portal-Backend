// ============================================================================
// Email Sender Resolution — the ONE authoritative sender for outgoing mail
// ============================================================================
// Order:
//   1. Admin-managed sender (email_settings, Admin → Email Management) — used
//      ONLY once it has been verified against Microsoft Graph.
//   2. MICROSOFT_SENDER_EMAIL (+ EMAIL_FROM_NAME) from the environment — the
//      bootstrap default, and the fallback whenever no verified DB sender exists.
// Credentials never live here; they stay in MICROSOFT_* environment variables.
// ============================================================================

export type SenderSource = 'database' | 'environment' | 'none'

export interface ResolvedSender {
  email: string | null
  name: string | null
  source: SenderSource
}

function envSender(): ResolvedSender {
  const email = process.env.MICROSOFT_SENDER_EMAIL?.trim() || null
  const name = process.env.EMAIL_FROM_NAME?.trim() || null
  return { email, name, source: email ? 'environment' : 'none' }
}

export async function resolveSender(): Promise<ResolvedSender> {
  // No database configured (e.g. unit tests) → environment only.
  if (!process.env.DATABASE_URL) return envSender()
  try {
    const { getEmailSettings } = await import('../../repositories/email-settings.repository')
    const row = await getEmailSettings()
    if (row?.senderStatus === 'verified' && row.senderEmail) {
      return { email: row.senderEmail, name: row.senderName || envSender().name, source: 'database' }
    }
  } catch (err) {
    // Fail-open to the environment sender — a settings lookup must never stop mail.
    console.warn('[Email][Sender] Settings lookup failed, using environment sender:', err instanceof Error ? err.message : err)
  }
  return envSender()
}
