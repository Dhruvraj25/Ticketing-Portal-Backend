import * as prefRepo from '../repositories/notification-preference.repository'
import { BadRequestError, ForbiddenError } from '../utils/errors'
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_EVENTS,
  canonicalNotificationEvent,
  indexPreferences,
  indexPreferencesFlexible,
  buildUserSettings,
  isNotificationEnabled,
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
 * Client users are no longer allowed to manage their own preferences.
 */
export async function updateUserNotificationSettings(
  user: NotificationPreferenceUser,
  body: { preferences?: PreferenceUpdate[] },
) {
  // Requirement: Client users (standard or approver) cannot manage their own preferences
  if (user.role === 'client') {
    throw new ForbiddenError('Client users cannot modify notification preferences. Admin or Manager must manage client preferences.')
  }

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

// ─── Client-wise preference management (Admin/Manager) ─────────────────────

/**
 * Get notification preferences for a specific client.
 * Only Admin or authorized Manager can access this.
 */
export async function getClientNotificationPreferences(clientId: string) {
  const rows = await prefRepo.findByClientId(clientId)
  const byClient = new Map<string, Map<string, boolean>>()
  byClient.set(clientId, indexPreferences(rows))

  // Default user settings for client role
  const preferences: UserNotificationSetting[] = buildUserSettings(
    { role: 'client', enableTeamsNotifications: false },
    byClient,
    clientId,
  )

  return {
    clientId,
    channels: NOTIFICATION_CHANNELS.map(c => ({ channel: c, label: NOTIFICATION_CHANNEL_LABELS[c] })),
    preferences,
  }
}

/**
 * Update notification preferences for a specific client.
 * Only Admin or authorized Manager can modify this.
 */
export async function updateClientNotificationPreferences(
  clientId: string,
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

    await prefRepo.upsertForClient(clientId, u.channel, canonical, u.enabled)
  }

  return getClientNotificationPreferences(clientId)
}

/**
 * Load explicit preference rows for many clients (for enforcement at dispatch
 * time). Returns clientId → indexed map usable with isNotificationEnabled().
 */
export async function loadPreferenceIndexForClients(clientIds: string[]): Promise<Map<string, Map<string, boolean>>> {
  const map = new Map<string, Map<string, boolean>>()
  if (clientIds.length === 0) return map
  const rows = await prefRepo.findByClientIds([...new Set(clientIds)])
  const grouped = new Map<string, NotificationPreferenceRowLike[]>()
  for (const row of rows) {
    const list = grouped.get(row.clientId) || []
    list.push(row)
    grouped.set(row.clientId, list)
  }
  for (const [cid, list] of grouped) {
    map.set(cid, indexPreferences(list))
  }
  return map
}

interface NotificationPreferenceRowLike {
  userId?: string
  clientId?: string
  channel: string
  eventType: string
  enabled: boolean
}

export { NOTIFICATION_EVENTS }
