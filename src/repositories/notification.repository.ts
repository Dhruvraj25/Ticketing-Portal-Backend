import { db } from '../config/db'
import { notification } from '../models/schema'
import { and, eq, desc, count } from 'drizzle-orm'

export async function findByUserId(userId: string, limitVal: number = 50) {
  return db
    .select({
      id: notification.id, userId: notification.userId,
      title: notification.title, message: notification.message,
      link: notification.link, ticketId: notification.ticketId,
      isRead: notification.isRead, createdAt: notification.createdAt,
    })
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(limitVal)
}

export async function unreadCount(userId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), eq(notification.isRead, false)))
  return Number(row?.count) || 0
}

export async function markRead(id: number, userId: string) {
  await db
    .update(notification)
    .set({ isRead: true })
    .where(and(eq(notification.id, id), eq(notification.userId, userId)))
}

export async function markAllRead(userId: string) {
  await db
    .update(notification)
    .set({ isRead: true })
    .where(and(eq(notification.userId, userId), eq(notification.isRead, false)))
}

export async function insert(data: any) {
  await db.insert(notification).values(data)
}
