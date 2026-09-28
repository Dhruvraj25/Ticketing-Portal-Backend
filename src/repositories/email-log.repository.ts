import { db } from '../config/db'
import { emailLog } from '../models/schema'
import { and, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm'

// ─── Email log (Admin Email Management) ─────────────────────────────────────
// Written by the email queue; read by the admin email-management routes.
// Status lifecycle: pending → sending → sent | failed (a retry puts a row back
// to pending with the last error). 'sent' means ACCEPTED by the provider —
// Microsoft Graph gives no mailbox-delivery or bounce signal.

export type EmailLogStatus = 'pending' | 'sending' | 'sent' | 'failed'

export interface EmailLogContext {
  ticketNumber?: string
  projectName?: string
  cc?: string[]
  bcc?: string[]
  queueId?: string
}

export async function createEmailLog(entry: {
  recipientEmail: string
  subject: string
  eventType: string
  fromAddress?: string | null
  maxRetries: number
  context?: EmailLogContext
}): Promise<number | null> {
  const [row] = await db
    .insert(emailLog)
    .values({
      recipientEmail: entry.recipientEmail,
      subject: entry.subject,
      eventType: entry.eventType,
      status: 'pending',
      fromAddress: entry.fromAddress ?? null,
      maxRetries: entry.maxRetries,
      metadata: entry.context ? JSON.stringify(entry.context) : null,
    })
    .returning({ id: emailLog.id })
  return row?.id ?? null
}

export async function updateEmailLog(
  id: number,
  values: { status: EmailLogStatus; retryCount?: number; errorMessage?: string | null; fromAddress?: string | null; sentAt?: Date | null },
): Promise<void> {
  await db.update(emailLog).set(values).where(eq(emailLog.id, id))
}

// ─── Admin reads ────────────────────────────────────────────────────────────

export interface EmailLogFilters {
  status?: string
  statuses?: string[]
  eventType?: string
  search?: string
  from?: Date
  to?: Date
  limit?: number
  offset?: number
}

function buildConditions(f: EmailLogFilters): SQL | undefined {
  const conditions: SQL[] = []
  if (f.status) conditions.push(eq(emailLog.status, f.status))
  if (f.statuses && f.statuses.length > 0) conditions.push(inArray(emailLog.status, f.statuses))
  if (f.eventType) conditions.push(eq(emailLog.eventType, f.eventType))
  if (f.from) conditions.push(gte(emailLog.createdAt, f.from))
  if (f.to) conditions.push(lte(emailLog.createdAt, f.to))
  if (f.search) {
    const term = `%${f.search.replace(/[%_\\]/g, (c) => '\\' + c)}%`
    conditions.push(or(ilike(emailLog.recipientEmail, term), ilike(emailLog.subject, term), ilike(emailLog.metadata, term))!)
  }
  return conditions.length > 0 ? and(...conditions) : undefined
}

const LIST_COLUMNS = {
  id: emailLog.id,
  recipientEmail: emailLog.recipientEmail,
  subject: emailLog.subject,
  eventType: emailLog.eventType,
  status: emailLog.status,
  fromAddress: emailLog.fromAddress,
  sentAt: emailLog.sentAt,
  retryCount: emailLog.retryCount,
  maxRetries: emailLog.maxRetries,
  errorMessage: emailLog.errorMessage,
  metadata: emailLog.metadata,
  createdAt: emailLog.createdAt,
}

export async function listEmailLogs(f: EmailLogFilters) {
  const where = buildConditions(f)
  const [rows, [{ total }]] = await Promise.all([
    db.select(LIST_COLUMNS).from(emailLog).where(where).orderBy(desc(emailLog.createdAt)).limit(Math.min(f.limit ?? 50, 200)).offset(f.offset ?? 0),
    db.select({ total: sql<number>`COUNT(*)::int` }).from(emailLog).where(where),
  ])
  return { rows, total }
}

export async function getEmailLogById(id: number) {
  const [row] = await db.select(LIST_COLUMNS).from(emailLog).where(eq(emailLog.id, id)).limit(1)
  return row ?? null
}

export async function getEmailLogStats(from?: Date, to?: Date) {
  const where = buildConditions({ from, to })
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      sent: sql<number>`COUNT(*) FILTER (WHERE ${emailLog.status} = 'sent')::int`,
      failed: sql<number>`COUNT(*) FILTER (WHERE ${emailLog.status} = 'failed')::int`,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${emailLog.status} IN ('pending', 'sending'))::int`,
    })
    .from(emailLog)
    .where(where)
  return row
}

/** Most recent subject actually sent for each event type (template catalog). */
export async function getLastSubjectsByEvent(): Promise<Map<string, { subject: string; createdAt: Date }>> {
  const rows = await db.execute<{ event_type: string; subject: string; created_at: Date }>(sql`
    SELECT DISTINCT ON (event_type) event_type, subject, created_at
      FROM email_log
     ORDER BY event_type, created_at DESC
  `)
  const map = new Map<string, { subject: string; createdAt: Date }>()
  for (const r of rows.rows) map.set(r.event_type, { subject: r.subject, createdAt: r.created_at })
  return map
}

export async function listEventTypesInLog(): Promise<string[]> {
  const rows = await db.selectDistinct({ eventType: emailLog.eventType }).from(emailLog).orderBy(emailLog.eventType)
  return rows.map((r) => r.eventType)
}
