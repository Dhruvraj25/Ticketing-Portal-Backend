import * as prefRepo from '../repositories/notification-preference.repository'
import { BadRequestError } from '../utils/errors'
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_EVENTS,
  canonicalNotificationEvent,
  indexPreferences,
  buildUserSettings,
  type NotificationChannel,
  type UserNotificationSetting,
} from '../lib/notification-preferences'

export interface NotificationPreferenceUser {
  id: string
  role: string
  enableTeamsNotifications?: boolean | null
}

/** GET /api/notifications/preferences — the authenticated user's effective settings. */
export async function getUserNotificationSettings(user: NotificationPreferenceUser) {
  const rows = await prefRepo.findByUserId(user.id)
  const byUser = new Map<string, Map<string, boolean>>()
  byUser.set(user.id, indexPreferences(rows))

  const preferences: UserNotificationSetting[] = buildUserSettings(
    { role: user.role, enableTeamsNotifications: user.enableTeamsNotifications ?? false },
    byUser,
    user.id,
  )

  return {
    channels: NOTIFICATION_CHANNELS.map(c => ({ channel: c, label: NOTIFICATION_CHANNEL_LABELS[c] })),
    // Legacy customer-level Teams switch — individual Teams preferences default
    // to this for client users. Kept in the payload for UI compatibility.
    customerTeamsEnabled: user.enableTeamsNotifications === true,
    preferences,
  }
}

export interface PreferenceUpdate {
  eventType: string
  channel: string
  enabled: boolean
}

/**
 * PUT /api/notifications/preferences — persist explicit toggles for the
 * authenticated user. Only the user's own rows can be modified.
 */
export async function updateUserNotificationSettings(
  user: NotificationPreferenceUser,
  body: { preferences?: PreferenceUpdate[] },
) {
  const updates = body?.preferences
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new BadRequestError('preferences must be a non-empty array of { eventType, channel, enabled }')
  }
  if (updates.length > 200) {
    throw new BadRequestError('Too many preference updates')
  }

  const seen = new Set<string>()
  for (const u of updates) {
    if (!u || typeof u !== 'object') throw new BadRequestError('Each preference update must be an object')

    const canonical = canonicalNotificationEvent(u.eventType)
    if (!canonical) {
      throw new BadRequestError(`Unknown notification event: ${u.eventType}`)
    }
    if (!NOTIFICATION_CHANNELS.includes(u.channel as NotificationChannel)) {
      throw new BadRequestError(`Unknown notification channel: ${u.channel}`)
    }
    if (typeof u.enabled !== 'boolean') {
      throw new BadRequestError('enabled must be a boolean')
    }

    const dedupeKey = `${u.channel}:${canonical}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    await prefRepo.upsert(user.id, u.channel, canonical, u.enabled)
  }

  return getUserNotificationSettings(user)
}

/**
 * Load explicit preference rows for many users (for enforcement at dispatch
 * time). Returns userId → indexed map usable with isNotificationEnabled().
 */
export async function loadPreferenceIndexForUsers(userIds: string[]): Promise<Map<string, Map<string, boolean>>> {
  const map = new Map<string, Map<string, boolean>>()
  if (userIds.length === 0) return map
  const rows = await prefRepo.findByUserIds([...new Set(userIds)])
  const grouped = new Map<string, NotificationPreferenceRowLike[]>()
  for (const row of rows) {
    const list = grouped.get(row.userId) || []
    list.push(row)
    grouped.set(row.userId, list)
  }
  for (const [uid, list] of grouped) {
    map.set(uid, indexPreferences(list))
  }
  return map
}

interface NotificationPreferenceRowLike {
  userId: string
  channel: string
  eventType: string
  enabled: boolean
}

export { NOTIFICATION_EVENTS }
