import { db } from '../config/db'
import { notificationPreference } from '../models/schema'
import { and, eq, inArray } from 'drizzle-orm'

// ─── Client-wise preferences (Admin/Manager manages per client) ─────────────

export async function findByClientId(clientId: string) {
  return db
    .select({
      clientId: notificationPreference.clientId,
      channel: notificationPreference.channel,
      eventType: notificationPreference.eventType,
      enabled: notificationPreference.enabled,
    })
    .from(notificationPreference)
    .where(eq(notificationPreference.clientId, clientId))
}

export async function findByClientIds(clientIds: string[]) {
  if (clientIds.length === 0) return []
  return db
    .select({
      clientId: notificationPreference.clientId,
      channel: notificationPreference.channel,
      eventType: notificationPreference.eventType,
      enabled: notificationPreference.enabled,
    })
    .from(notificationPreference)
    .where(inArray(notificationPreference.clientId, clientIds))
}

/**
 * Upsert a single preference row for (client, channel, eventType).
 * Absent rows mean "default" — callers should only persist explicit toggles.
 */
export async function upsertForClient(clientId: string, channel: string, eventType: string, enabled: boolean) {
  const existing = await db
    .select({ id: notificationPreference.id })
    .from(notificationPreference)
    .where(and(
      eq(notificationPreference.clientId, clientId),
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
    await db.insert(notificationPreference).values({ clientId, channel, eventType, enabled, updatedAt: new Date() })
  }
}

// ─── Legacy user-based preferences (kept for transition compatibility) ──────
// The old user-level API is retained so existing code paths that read user
// preferences (e.g. when resolving recipients by email) don't break. New
// client-management code should use the client-based functions above.

export async function findByUserId(userId: string) {
  return db
    .select({
      clientId: notificationPreference.clientId,
      channel: notificationPreference.channel,
      eventType: notificationPreference.eventType,
      enabled: notificationPreference.enabled,
    })
    .from(notificationPreference)
    .where(eq(notificationPreference.clientId, userId))
}

export async function findByUserIds(userIds: string[]) {
  if (userIds.length === 0) return []
  return db
    .select({
      clientId: notificationPreference.clientId,
      channel: notificationPreference.channel,
      eventType: notificationPreference.eventType,
      enabled: notificationPreference.enabled,
    })
    .from(notificationPreference)
    .where(inArray(notificationPreference.clientId, userIds))
}

/**
 * Upsert a single preference row for (client, channel, eventType).
 * Absent rows mean "default" — callers should only persist explicit toggles.
 */
export async function upsert(clientId: string, channel: string, eventType: string, enabled: boolean) {
  const existing = await db
    .select({ id: notificationPreference.id })
    .from(notificationPreference)
    .where(and(
      eq(notificationPreference.clientId, clientId),
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
    await db.insert(notificationPreference).values({ clientId, channel, eventType, enabled, updatedAt: new Date() })
  }
}

export async function remove(clientId: string, channel: string, eventType: string) {
  await db
    .delete(notificationPreference)
    .where(and(
      eq(notificationPreference.clientId, clientId),
      eq(notificationPreference.channel, channel),
      eq(notificationPreference.eventType, eventType),
    ))
}
