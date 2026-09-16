// ============================================================================
// Project Microsoft Teams Channel Repository
// ============================================================================
// Persistence for the per-project Teams channel webhook. One row per project.
//
// SECURITY: the webhook URL embeds a signature that authenticates the call —
// it is a SECRET. These functions return it for server-side delivery only.
// Never forward a row (or any field of it) directly to the frontend; routes
// must project safe fields (configured / enabled / updatedAt) instead.
// ============================================================================

import { db } from '../config/db'
import { project, projectTeamsChannel } from '../models/schema'
import { and, asc, eq, sql } from 'drizzle-orm'

export interface ProjectTeamsChannelRow {
  id: number
  projectId: number
  webhookUrl: string
  enabled: boolean
  updatedAt: Date | null
  /** Optional — only present when the admin configured @mention support. */
  teamId: string | null
  channelId: string | null
}

export interface ProjectTeamsChannelStatus {
  projectId: number
  projectName: string
  projectCode: string
  projectStatus: string
  configured: boolean
  enabled: boolean
  updatedAt: Date | null
}

/** Server-side lookup of the raw channel row (includes the secret webhook URL). */
export async function findByProjectId(projectId: number): Promise<ProjectTeamsChannelRow | null> {
  const [row] = await db
    .select({
      id: projectTeamsChannel.id,
      projectId: projectTeamsChannel.projectId,
      webhookUrl: projectTeamsChannel.webhookUrl,
      enabled: projectTeamsChannel.enabled,
      updatedAt: projectTeamsChannel.updatedAt,
      teamId: projectTeamsChannel.teamId,
      channelId: projectTeamsChannel.channelId,
    })
    .from(projectTeamsChannel)
    .where(eq(projectTeamsChannel.projectId, projectId))
    .limit(1)
  return row ?? null
}

/**
 * Resolve a channel by project NAME. Project names are only unique per client,
 * so this returns a match ONLY when exactly one enabled channel matches — an
 * ambiguous name must never silently route notifications to the wrong channel.
 */
export async function findEnabledByProjectName(projectName: string): Promise<ProjectTeamsChannelRow | null> {
  const name = (projectName || '').trim()
  if (!name) return null

  const rows = await db
    .select({
      id: projectTeamsChannel.id,
      projectId: projectTeamsChannel.projectId,
      webhookUrl: projectTeamsChannel.webhookUrl,
      enabled: projectTeamsChannel.enabled,
      updatedAt: projectTeamsChannel.updatedAt,
      teamId: projectTeamsChannel.teamId,
      channelId: projectTeamsChannel.channelId,
    })
    .from(projectTeamsChannel)
    .innerJoin(project, eq(projectTeamsChannel.projectId, project.id))
    .where(and(
      eq(projectTeamsChannel.enabled, true),
      sql`LOWER(${project.projectName}) = ${name.toLowerCase()}`,
    ))
    .limit(2)

  return rows.length === 1 ? rows[0] : null
}

/** Safe status list for the admin UI — never includes the webhook URL. */
export async function listWithProjects(): Promise<ProjectTeamsChannelStatus[]> {
  return db
    .select({
      projectId: project.id,
      projectName: project.projectName,
      projectCode: project.projectCode,
      projectStatus: project.status,
      configured: sql<boolean>`(${projectTeamsChannel.id} IS NOT NULL)`,
      enabled: sql<boolean>`COALESCE(${projectTeamsChannel.enabled}, false)`,
      updatedAt: projectTeamsChannel.updatedAt,
    })
    .from(project)
    .leftJoin(projectTeamsChannel, eq(projectTeamsChannel.projectId, project.id))
    .orderBy(asc(project.projectName))
}

/**
 * Create or replace the project's channel configuration.
 * `webhookUrl` is always overwritten on update (the admin re-pastes the link;
 * the stored secret is never displayed back to them).
 *
 * `teamId`/`channelId` are optional and independent of the webhook — they
 * only enable @mention delivery via Microsoft Graph (see
 * services/teams/teams-graph-client.ts). Passing `undefined` for either
 * leaves the stored value unchanged (edit-in-place); passing an explicit
 * empty string clears it. This mirrors the webhookUrl "omit to keep"
 * convention already used by the PUT route.
 */
export async function upsert(
  projectId: number,
  data: { webhookUrl: string; enabled: boolean; configuredBy: string | null; teamId?: string | null; channelId?: string | null },
): Promise<ProjectTeamsChannelRow> {
  const [row] = await db
    .insert(projectTeamsChannel)
    .values({
      projectId,
      webhookUrl: data.webhookUrl,
      enabled: data.enabled,
      configuredBy: data.configuredBy,
      teamId: data.teamId ?? null,
      channelId: data.channelId ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: projectTeamsChannel.projectId,
      set: {
        webhookUrl: data.webhookUrl,
        enabled: data.enabled,
        configuredBy: data.configuredBy,
        ...(data.teamId !== undefined ? { teamId: data.teamId } : {}),
        ...(data.channelId !== undefined ? { channelId: data.channelId } : {}),
        updatedAt: new Date(),
      },
    })
    .returning({
      id: projectTeamsChannel.id,
      projectId: projectTeamsChannel.projectId,
      webhookUrl: projectTeamsChannel.webhookUrl,
      enabled: projectTeamsChannel.enabled,
      updatedAt: projectTeamsChannel.updatedAt,
      teamId: projectTeamsChannel.teamId,
      channelId: projectTeamsChannel.channelId,
    })
  return row
}

/** Toggle a channel without re-supplying the link. Returns null when absent. */
export async function setEnabled(projectId: number, enabled: boolean): Promise<ProjectTeamsChannelRow | null> {
  const [row] = await db
    .update(projectTeamsChannel)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(projectTeamsChannel.projectId, projectId))
    .returning({
      id: projectTeamsChannel.id,
      projectId: projectTeamsChannel.projectId,
      webhookUrl: projectTeamsChannel.webhookUrl,
      enabled: projectTeamsChannel.enabled,
      updatedAt: projectTeamsChannel.updatedAt,
      teamId: projectTeamsChannel.teamId,
      channelId: projectTeamsChannel.channelId,
    })
  return row ?? null
}

/** Remove the project's channel configuration entirely. */
export async function remove(projectId: number): Promise<boolean> {
  const [row] = await db
    .delete(projectTeamsChannel)
    .where(eq(projectTeamsChannel.projectId, projectId))
    .returning({ id: projectTeamsChannel.id })
  return !!row
}

/** Cheap existence/enabled check (no secret returned). */
export async function isEnabledForProject(projectId: number): Promise<boolean> {
  const [row] = await db
    .select({ enabled: projectTeamsChannel.enabled })
    .from(projectTeamsChannel)
    .where(eq(projectTeamsChannel.projectId, projectId))
    .limit(1)
  return !!row?.enabled
}

export const projectTeamsChannelRepository = {
  findByProjectId,
  findEnabledByProjectName,
  listWithProjects,
  upsert,
  setEnabled,
  remove,
  isEnabledForProject,
}
