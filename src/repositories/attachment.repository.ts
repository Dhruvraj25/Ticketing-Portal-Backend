import { db } from '../config/db'
import { attachment, user } from '../models/schema'
import { eq, desc, inArray, and } from 'drizzle-orm'

export async function create(data: any) {
  const [row] = await db.insert(attachment).values(data).returning()
  return row
}

export async function findByTicketId(ticketId: number) {
  return db
    .select({
      id: attachment.id, ticketId: attachment.ticketId,
      uploadedById: attachment.uploadedById, filename: attachment.filename,
      url: attachment.url, publicId: attachment.publicId,
      mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt,
    })
    .from(attachment)
    .where(eq(attachment.ticketId, ticketId))
    .orderBy(desc(attachment.createdAt))
}

export async function remove(id: number) {
  await db.delete(attachment).where(eq(attachment.id, id))
}

export async function countByTicketIds(ticketIds: number[]) {
  if (ticketIds.length === 0) return []
  const { count } = await import('drizzle-orm')
  return db
    .select({ ticketId: attachment.ticketId, count: count().as('count') })
    .from(attachment)
    .where(inArray(attachment.ticketId, ticketIds))
    .groupBy(attachment.ticketId)
}
