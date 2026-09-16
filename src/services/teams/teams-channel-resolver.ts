// ============================================================================
// Teams Channel Resolver — Per-Project Routing
// ============================================================================
// Resolves which Teams webhook a notification must be delivered to:
//
//   1. The PROJECT's configured channel (project_teams_channel)
//   2. The global TEAMS_WEBHOOK_URL fallback (when the project has none)
//   3. Nothing → the queue's mock mode (existing graceful behavior)
//
// The routing POLICY is implemented as a pure function so it can be unit
// tested without a database; the DB lookup is a thin async wrapper.
//
// SECURITY: a resolved webhook URL is a secret and must never be logged or
// returned to a client. Log lines here contain project IDs only.
// ============================================================================

import { TEAMS_LOG_PREFIX, TEAMS_ENV_KEYS } from './teams.constants'
import { validateTeamsWebhookUrl } from './teams-config-validator'
import type { TeamsConfig, GraphTeamsMember } from './teams.types'
import type { GraphCallError } from './teams-graph-client'

export type TeamsWebhookSource = 'project' | 'global' | 'none'

export interface ResolvedTeamsChannel {
  /** Secret. Present only when a usable channel was resolved. */
  webhookUrl?: string
  enabled: boolean
  mockMode: boolean
  source: TeamsWebhookSource
  projectId?: number
  /** Safe, non-secret explanation used for admin diagnostics / logging. */
  reason?: string
}

export interface ResolveTeamsChannelInputs {
  projectId?: number
  projectChannel?: { webhookUrl: string; enabled: boolean } | null
  globalWebhookUrl?: string | null
}

function globalFallback(globalWebhookUrl: string | null | undefined, reason: string): ResolvedTeamsChannel {
  const url = (globalWebhookUrl || '').trim()
  if (url) {
    return { webhookUrl: url, enabled: true, mockMode: false, source: 'global', reason }
  }
  return { enabled: false, mockMode: true, source: 'none', reason: reason === 'no_project_channel' ? 'no_channel_configured' : reason }
}

/**
 * Pure routing policy. Order of precedence:
 *   - project channel present & enabled & valid   → project channel
 *   - project channel present & enabled & invalid → global fallback (logged)
 *   - project channel present & DISABLED          → no delivery (explicit opt-out;
 *     the global fallback is intentionally NOT used)
 *   - project channel absent                      → global fallback → none
 */
export function resolveTeamsChannelFromInputs(inputs: ResolveTeamsChannelInputs): ResolvedTeamsChannel {
  const channel = inputs.projectChannel
  const global = inputs.globalWebhookUrl

  if (channel) {
    if (!channel.enabled) {
      return {
        enabled: false,
        mockMode: true,
        source: 'none',
        projectId: inputs.projectId,
        reason: 'project_channel_disabled',
      }
    }

    const validation = validateTeamsWebhookUrl(channel.webhookUrl)
    if (!validation.valid) {
      console.error(
        TEAMS_LOG_PREFIX + ' Project ' + (inputs.projectId ?? '?') +
        ' Teams channel is invalid (' + validation.message + ') — falling back to the global webhook',
      )
      return globalFallback(global, 'invalid_project_channel')
    }

    return {
      webhookUrl: channel.webhookUrl,
      enabled: true,
      mockMode: false,
      source: 'project',
      projectId: inputs.projectId,
    }
  }

  return globalFallback(global, 'no_project_channel')
}

export function getGlobalWebhookUrl(): string | undefined {
  return process.env[TEAMS_ENV_KEYS.WEBHOOK_URL]
}

/**
 * DB-backed resolution for a notification's project context.
 * Lazily imports the repository so the pure paths (and mock-mode smoke tests)
 * never touch a database connection.
 */
export async function resolveTeamsChannelForProject(params: {
  projectId?: number
  projectName?: string
}): Promise<ResolvedTeamsChannel> {
  const globalWebhookUrl = getGlobalWebhookUrl()

  let projectChannel: { webhookUrl: string; enabled: boolean } | null = null
  let projectId = params.projectId

  try {
    if (projectId) {
      const repo = await import('../../repositories/project-teams-channel.repository')
      const row = await repo.findByProjectId(projectId)
      projectChannel = row ? { webhookUrl: row.webhookUrl, enabled: row.enabled } : null
    } else if (params.projectName) {
      const repo = await import('../../repositories/project-teams-channel.repository')
      const row = await repo.findEnabledByProjectName(params.projectName)
      projectChannel = row ? { webhookUrl: row.webhookUrl, enabled: row.enabled } : null
      projectId = row?.projectId
    }
  } catch (err) {
    // Fail safe: a lookup failure must never silently misroute to another
    // project's channel. Fall back to the global default (or mock mode).
    // Log the UNDERLYING cause only — a drizzle "Failed query" message embeds
    // the full SQL + parameters, which is noisy and must never be the log line.
    const underlying = (err as { cause?: { message?: string } })?.cause?.message
    const reason = String(underlying || (err instanceof Error ? err.message : err)).split('\n')[0].slice(0, 200)
    console.error(
      TEAMS_LOG_PREFIX + ' Channel lookup failed for project ' +
      (params.projectId ?? params.projectName ?? '?') + ': ' + reason,
    )
    return globalFallback(globalWebhookUrl, 'channel_lookup_failed')
  }

  return resolveTeamsChannelFromInputs({ projectId, projectChannel, globalWebhookUrl })
}

/** True when some Teams destination (project channel or global) can receive. */
export async function isTeamsEnabledForProject(projectId?: number): Promise<boolean> {
  const resolved = await resolveTeamsChannelForProject({ projectId })
  return resolved.enabled
}

export interface ProjectMentionTarget {
  teamId: string
  channelId: string
}

export interface ProjectTeamsMembersResult {
  members: GraphTeamsMember[]
  /** Present when member resolution could not complete (Graph error, missing permission, etc). */
  error?: GraphCallError
  /**
   * The Graph target this result came from — undefined when the project has
   * no Team ID/Channel ID configured (mentions were never attempted, this is
   * NOT an error — it's the normal "webhook-only" case for most projects).
   */
  target?: ProjectMentionTarget
}

/**
 * Resolve the Team ID + Channel ID configured for a SPECIFIC project only —
 * this never reads another project's row and never falls back to the global
 * TEAMS_DEFAULT_TEAM_ID/TEAMS_DEFAULT_CHANNEL_ID env defaults, so one
 * project's members can never leak into another project's notification.
 * A project with no teamId/channelId configured returns `null` — the normal,
 * expected state for any project that hasn't opted into @mentions.
 */
async function resolveProjectMentionTarget(projectId: number): Promise<ProjectMentionTarget | null> {
  try {
    const repo = await import('../../repositories/project-teams-channel.repository')
    const row = await repo.findByProjectId(projectId)
    if (!row || !row.teamId || !row.channelId) return null
    return { teamId: row.teamId, channelId: row.channelId }
  } catch (err) {
    console.error(
      TEAMS_LOG_PREFIX + ' Mention-target lookup failed for project ' + projectId + ': ' +
      (err instanceof Error ? err.message : String(err)),
    )
    return null
  }
}

/**
 * getProjectTeamsMembers(projectId) — the server-side member-lookup entry
 * point required by the @mention feature.
 *
 *   1. Resolves ONLY this project's configured Team ID + Channel ID.
 *   2. Returns `{ members: [] }` (no error) when the project has none
 *      configured — the normal case; callers must treat this exactly like
 *      "no mentions available" and fall back to the plain webhook message.
 *   3. Otherwise fetches (and caches) the channel's real membership via
 *      Microsoft Graph — see teams-graph-client.ts.
 */
export async function getProjectTeamsMembers(projectId: number): Promise<ProjectTeamsMembersResult> {
  const target = await resolveProjectMentionTarget(projectId)
  if (!target) return { members: [] }

  const { getChannelMembers } = await import('./teams-graph-client')
  const result = await getChannelMembers(target.teamId, target.channelId)
  return { members: result.members, error: result.error, target }
}

/** Adapt a resolved channel to the transport config consumed by the queue. */
export function toTeamsConfig(resolved: ResolvedTeamsChannel): TeamsConfig {
  return {
    webhookUrl: resolved.webhookUrl,
    enabled: resolved.enabled && !!resolved.webhookUrl,
    mockMode: !(resolved.enabled && !!resolved.webhookUrl),
  }
}

export const teamsChannelResolver = {
  resolveTeamsChannelFromInputs,
  resolveTeamsChannelForProject,
  isTeamsEnabledForProject,
  toTeamsConfig,
  getGlobalWebhookUrl,
  getProjectTeamsMembers,
}
