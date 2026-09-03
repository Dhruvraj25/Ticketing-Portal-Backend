import * as notificationService from '../services/notification.service'
import * as prefService from '../services/notification-preference.service'
import { wrapController } from '../lib/performance-profiler'
import type { AuthenticatedUser } from '../services/user.service'

export const getNotifications = wrapController('getNotifications', async (currentUser: { id: string }) =>
  notificationService.getNotifications(currentUser.id))

export const getUnreadCount = wrapController('getUnreadCount', async (currentUser: { id: string }) =>
  notificationService.getUnreadCount(currentUser.id))

export const markAsRead = wrapController('markAsRead', async (notificationId: number, currentUser: { id: string }) =>
  notificationService.markAsRead(notificationId, currentUser.id))

export const markAllAsRead = wrapController('markAllAsRead', async (currentUser: { id: string }) =>
  notificationService.markAllAsRead(currentUser.id))

// ─── Notification Preferences (Requirement #14) ────────────────────────────
// GET  /api/notifications/preferences — effective settings for current user.
// PUT  /api/notifications/preferences — persist the user's own toggles.

export const getNotificationPreferences = wrapController('getNotificationPreferences',
  async (currentUser: AuthenticatedUser) => {
    const user = await (await import('../services/user.service')).getCurrentUser(currentUser)
    return prefService.getUserNotificationSettings(user)
  })

export const updateNotificationPreferences = wrapController('updateNotificationPreferences',
  async (currentUser: AuthenticatedUser, body: any) => {
    const user = await (await import('../services/user.service')).getCurrentUser(currentUser)
    return prefService.updateUserNotificationSettings(user, body)
  })
