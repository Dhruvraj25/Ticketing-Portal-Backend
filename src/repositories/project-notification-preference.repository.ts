// ============================================================================
// Project Notification Preference Repository
// ============================================================================
// PROJECT-wise notification preferences (authoritative). One row per
// (projectId, channel, eventType) — only stored when an Admin/Manager explicitly
// changes a preference. Absent rows fall back to the legacy client table (see
// notification-preference.repository.ts) and then to the built-in defaults.
// ============================================================================

import { db } from '../config/db'
import { projectNotificationPreference } from '../models/schema'
import { and, eq, inArray } from 'drizzle-orm'

export interface ProjectNotificationPreferenceRow {
  projectId: number
  channel: string
  eventType: string
  enabled: boolean
}

export async function findByProjectId(projectId: number): Promise<ProjectNotificationPreferenceRow[]> {
  return db
    .select({
      projectId: projectNotificationPreference.projectId,
      channel: projectNotificationPreference.channel,
      eventType: projectNotificationPreference.eventType,
      enabled: projectNotificationPreference.enabled,
    })
    .from(projectNotificationPreference)
    .where(eq(projectNotificationPreference.projectId, projectId))
}

export async function findByProjectIds(projectIds: number[]): Promise<ProjectNotificationPreferenceRow[]> {
  if (projectIds.length === 0) return []
  return db
    .select({
      projectId: projectNotificationPreference.projectId,
      channel: projectNotificationPreference.channel,
      eventType: projectNotificationPreference.eventType,
      enabled: projectNotificationPreference.enabled,
    })
    .from(projectNotificationPreference)
    .where(inArray(projectNotificationPreference.projectId, [...new Set(projectIds)]))
}

/**
 * Upsert a single preference for (project, channel, eventType).
 * Absent rows mean "inherit" — callers persist only explicit toggles.
 */
export async function upsertForProject(
  projectId: number,
  channel: string,
  eventType: string,
  enabled: boolean,
): Promise<void> {
  const existing = await db
    .select({ id: projectNotificationPreference.id })
    .from(projectNotificationPreference)
    .where(and(
      eq(projectNotificationPreference.projectId, projectId),
      eq(projectNotificationPreference.channel, channel),
      eq(projectNotificationPreference.eventType, eventType),
    ))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(projectNotificationPreference)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(projectNotificationPreference.id, existing[0].id))
  } else {
    await db
      .insert(projectNotificationPreference)
      .values({ projectId, channel, eventType, enabled, updatedAt: new Date() })
  }
}

export async function remove(projectId: number, channel: string, eventType: string): Promise<void> {
  await db
    .delete(projectNotificationPreference)
    .where(and(
      eq(projectNotificationPreference.projectId, projectId),
      eq(projectNotificationPreference.channel, channel),
      eq(projectNotificationPreference.eventType, eventType),
    ))
}

export const projectNotificationPreferenceRepository = {
  findByProjectId,
  findByProjectIds,
  upsertForProject,
  remove,
}
