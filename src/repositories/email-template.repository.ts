import { db } from '../config/db'
import { emailTemplates } from '../models/schema'
import { eq } from 'drizzle-orm'

// ─── Admin-customized email templates (one row per event_type) ──────────────

export type EmailTemplateRow = typeof emailTemplates.$inferSelect

export async function listEmailTemplateOverrides(): Promise<EmailTemplateRow[]> {
  return db.select().from(emailTemplates)
}

export async function getEmailTemplateOverride(eventType: string): Promise<EmailTemplateRow | null> {
  const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.eventType, eventType)).limit(1)
  return row ?? null
}

export async function upsertEmailTemplateOverride(values: {
  eventType: string
  name: string
  subject: string
  htmlBody: string
  textBody: string | null
  isActive: boolean
  updatedBy: string
}): Promise<EmailTemplateRow> {
  const now = new Date()
  const [row] = await db
    .insert(emailTemplates)
    .values({ ...values, updatedAt: now })
    .onConflictDoUpdate({
      target: emailTemplates.eventType,
      set: {
        name: values.name,
        subject: values.subject,
        htmlBody: values.htmlBody,
        textBody: values.textBody,
        isActive: values.isActive,
        updatedBy: values.updatedBy,
        updatedAt: now,
      },
    })
    .returning()
  return row
}

/** Reset to Default: remove the override so the built-in code template is used again. */
export async function deleteEmailTemplateOverride(eventType: string): Promise<boolean> {
  const rows = await db.delete(emailTemplates).where(eq(emailTemplates.eventType, eventType)).returning({ id: emailTemplates.id })
  return rows.length > 0
}
