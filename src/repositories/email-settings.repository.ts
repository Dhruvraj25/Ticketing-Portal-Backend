import { db } from '../config/db'
import { emailSettings } from '../models/schema'
import { eq } from 'drizzle-orm'

// ─── Admin-managed email settings (single row, id = 1) ──────────────────────
// Holds only non-secret values: sender address/name, verification and
// provider-check status. Credentials stay in environment variables.

const SETTINGS_ID = 1
const CACHE_TTL_MS = 30_000

export type EmailSettingsRow = typeof emailSettings.$inferSelect

let cache: { row: EmailSettingsRow | null; expiresAt: number } | null = null

/** Read the settings row (cached briefly — read on every outgoing email). */
export async function getEmailSettings(): Promise<EmailSettingsRow | null> {
  if (cache && cache.expiresAt > Date.now()) return cache.row
  const [row] = await db.select().from(emailSettings).where(eq(emailSettings.id, SETTINGS_ID)).limit(1)
  cache = { row: row ?? null, expiresAt: Date.now() + CACHE_TTL_MS }
  return row ?? null
}

export function invalidateEmailSettingsCache(): void {
  cache = null
}

/** Insert-or-update the single settings row with the given fields. */
export async function upsertEmailSettings(values: Partial<Omit<EmailSettingsRow, 'id' | 'createdAt'>>): Promise<void> {
  const now = new Date()
  await db
    .insert(emailSettings)
    .values({ id: SETTINGS_ID, ...values, updatedAt: now })
    .onConflictDoUpdate({ target: emailSettings.id, set: { ...values, updatedAt: now } })
  invalidateEmailSettingsCache()
}
