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
 * Requirement: the backend enforces per-event In-App preferences.
 * When `projectId` is supplied the PROJECT's preferences are authoritative for
 * every recipient (internal staff included); otherwise the legacy per-client /
 * per-user lookup applies (account-level events).
 * `eventType` is optional for legacy callers; when omitted the default
 * (enabled) behavior applies, so existing notifications are never suppressed.
 */
export async function createNotification(data: { userId: string; title: string; message: string; link?: string; ticketId?: number; eventType?: string; userRole?: string; clientId?: string; projectId?: number }) {
  if (data.eventType) {
    const role = data.userRole || 'admin'

    if (data.projectId) {
      // PROJECT-wise (authoritative) — same source as Email and Teams.
      const { loadMergedPreferenceMapForProject } = await import('./notification-preference.service')
      const merged = await loadMergedPreferenceMapForProject(data.projectId)
      const allowed = isNotificationEnabled(merged, 'in_app', data.eventType, { role })
      console.log(
        `[NotificationPreference] projectId=${data.projectId} event=${data.eventType} ` +
        `enabled=${allowed} channel=in_app`,
      )
      if (!allowed) return false
      await notificationRepo.insert({
        userId: data.userId,
        title: data.title,
        message: data.message,
        link: data.link,
        ticketId: data.ticketId,
      })
      return true
    }

    let rows: any[]
    // For client users, use client-based preferences
    if (data.userRole === 'client' && data.clientId) {
      rows = await prefRepo.findByClientId(data.clientId)
    } else {
      rows = await prefRepo.findByUserId(data.userId)
    }
    const indexed = indexPreferences(rows)
    const allowed = isNotificationEnabled(indexed, 'in_app', data.eventType, { role })
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
