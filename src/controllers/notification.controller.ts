import * as notificationService from '../services/notification.service'
import { wrapController } from '../lib/performance-profiler'

export const getNotifications = wrapController('getNotifications', async (currentUser: { id: string }) =>
  notificationService.getNotifications(currentUser.id))

export const getUnreadCount = wrapController('getUnreadCount', async (currentUser: { id: string }) =>
  notificationService.getUnreadCount(currentUser.id))

export const markAsRead = wrapController('markAsRead', async (notificationId: number, currentUser: { id: string }) =>
  notificationService.markAsRead(notificationId, currentUser.id))

export const markAllAsRead = wrapController('markAllAsRead', async (currentUser: { id: string }) =>
  notificationService.markAllAsRead(currentUser.id))
