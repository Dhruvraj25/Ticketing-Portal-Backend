import * as notificationRepo from '../repositories/notification.repository'
import * as prefRepo from '../repositories/notification-preference.repository'
import { isNotificationEnabled, indexPreferences } from '../lib/notification-preferences'

export async function getNotifications(userId: string) {
  return notificationRepo.findByUserId(userId)
}

export async function getUnreadCount(userId: string) {
  return notificationRepo.unreadCount(userId)
}

export async function markAsRead(notificationId: number, userId: string) {
  await notificationRepo.markRead(notificationId, userId)
}

export async function markAllAsRead(userId: string) {
  await notificationRepo.markAllRead(userId)
}

/**
 * Create an in-app notification for a user.
 *
 * Requirement #14: the backend enforces per-event In-App preferences — when the
 * recipient has explicitly disabled this event on the In-App channel, no row is
 * created. `eventType` is optional for legacy callers; when omitted the default
 * (enabled) behavior applies, so existing notifications are never suppressed.
 */
export async function createNotification(data: { userId: string; title: string; message: string; link?: string; ticketId?: number; eventType?: string }) {
  if (data.eventType) {
    const rows = await prefRepo.findByUserId(data.userId)
    const indexed = indexPreferences(rows)
    const allowed = isNotificationEnabled(indexed, 'in_app', data.eventType, { role: 'admin' })
    if (!allowed) return false
  }
  await notificationRepo.insert({
    userId: data.userId,
    title: data.title,
    message: data.message,
    link: data.link,
    ticketId: data.ticketId,
  })
  return true
}
