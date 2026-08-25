/**
 * Notification type categorization helpers
 * Infers the notification type/category from the title and message.
 */

export type NotificationType = 'ticket' | 'project' | 'system' | 'mention' | 'comment' | 'wallet' | 'general'

export function categorizeNotification(title: string, message: string): NotificationType {
  const lower = `${title} ${message}`.toLowerCase()

  if (lower.includes('@') || lower.includes('mentioned') || lower.includes('mention')) {
    return 'mention'
  }

  if (lower.includes('wallet') || lower.includes('support hour') || lower.includes('recharged') || lower.includes('balance') || lower.includes('low balance')) {
    return 'wallet'
  }

  if (lower.includes('ticket') || lower.includes('reopened') || lower.includes('resolved') || lower.includes('assigned') || lower.includes('pending') || lower.includes('submitted') || lower.includes('created')) {
    return 'ticket'
  }

  if (lower.includes('comment') || lower.includes('note') || lower.includes('feedback')) {
    return 'comment'
  }

  if (lower.includes('project') || lower.includes('module') || lower.includes('milestone')) {
    return 'project'
  }

  if (lower.includes('system') || lower.includes('alert') || lower.includes('maintenance') || lower.includes('error') || lower.includes('warning')) {
    return 'system'
  }

  return 'general'
}

export interface NotificationTab {
  id: string
  label: string
  filter: (title: string, message: string) => boolean
}

export const NOTIFICATION_TABS: NotificationTab[] = [
  {
    id: 'all',
    label: 'All',
    filter: () => true,
  },
  {
    id: 'unread',
    label: 'Unread',
    filter: () => true, // Handled separately by isRead check
  },
  {
    id: 'tickets',
    label: 'Tickets',
    filter: (title, message) => categorizeNotification(title, message) === 'ticket',
  },
  {
    id: 'projects',
    label: 'Projects',
    filter: (title, message) => categorizeNotification(title, message) === 'project',
  },
  {
    id: 'system',
    label: 'System',
    filter: (title, message) => categorizeNotification(title, message) === 'system',
  },
  {
    id: 'mentions',
    label: 'Mentions',
    filter: (title, message) => categorizeNotification(title, message) === 'mention',
  },
  {
    id: 'wallet',
    label: 'Wallet',
    filter: (title, message) => categorizeNotification(title, message) === 'wallet',
  },
]
