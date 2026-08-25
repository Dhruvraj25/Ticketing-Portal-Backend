import * as notificationRepo from '../repositories/notification.repository'

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

export async function createNotification(data: { userId: string; title: string; message: string; link?: string; ticketId?: number }) {
  await notificationRepo.insert(data)
}
