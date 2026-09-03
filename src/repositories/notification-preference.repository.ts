import { db } from '../config/db'
import { notificationPreference } from '../models/schema'
import { and, eq, inArray } from 'drizzle-orm'

export async function findByUserId(userId: string) {
  return db
    .select({
      userId: notificationPreference.userId,
      channel: notificationPreference.channel,
      eventType: notificationPreference.eventType,
      enabled: notificationPreference.enabled,
    })
    .from(notificationPreference)
    .where(eq(notificationPreference.userId, userId))
}

export async function findByUserIds(userIds: string[]) {
  if (userIds.length === 0) return []
  return db
    .select({
      userId: notificationPreference.userId,
      channel: notificationPreference.channel,
      eventType: notificationPreference.eventType,
      enabled: notificationPreference.enabled,
    })
    .from(notificationPreference)
    .where(inArray(notificationPreference.userId, userIds))
}

/**
 * Upsert a single preference row for (user, channel, eventType).
 * Absent rows mean "default" — callers should only persist explicit toggles.
 */
export async function upsert(userId: string, channel: string, eventType: string, enabled: boolean) {
  const existing = await db
    .select({ id: notificationPreference.id })
    .from(notificationPreference)
    .where(and(
      eq(notificationPreference.userId, userId),
      eq(notificationPreference.channel, channel),
      eq(notificationPreference.eventType, eventType),
    ))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(notificationPreference)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(notificationPreference.id, existing[0].id))
  } else {
    await db.insert(notificationPreference).values({ userId, channel, eventType, enabled, updatedAt: new Date() })
  }
}

export async function remove(userId: string, channel: string, eventType: string) {
  await db
    .delete(notificationPreference)
    .where(and(
      eq(notificationPreference.userId, userId),
      eq(notificationPreference.channel, channel),
      eq(notificationPreference.eventType, eventType),
    ))
}
