// ============================================================================
// Teams Graph Client — @mention-capable channel messaging via Microsoft Graph
// ============================================================================
// The existing Incoming Webhook / Power Automate Workflow transport
// (teams-webhook-client.ts) posts a message into a Teams channel, but it
// CANNOT create a real, notification-triggering @mention: a webhook message
// is posted as an anonymous "Connector" identity with no bound Teams
// conversation, so Teams does not resolve `<at>` tokens from it into a ping
// for a specific person (this is a documented Microsoft limitation of
// Incoming Webhooks, not a bug in this codebase). Real per-user mention
// notifications require the message to be sent through Microsoft Graph's
// chatMessage API against a specific Team/Channel, with an explicit
// `mentions` array bound to each user's Azure AD object ID.
//
// This module is therefore a SEPARATE, ADDITIONAL transport, used only for
// projects an admin has explicitly configured with a Team ID + Channel ID
// (see project_teams_channel.teamId/channelId, migration 0018). Projects
// without that configuration are completely unaffected — see
// teams-channel-resolver.ts's getProjectTeamsMembers(), which returns no
// members and no error when a project has no Graph configuration, so the
// caller falls back to the existing webhook-only path unchanged.
//
// Auth: uses its OWN app registration (TEAMS_TENANT_ID / TEAMS_CLIENT_ID /
// TEAMS_CLIENT_SECRET) — deliberately NOT the MICROSOFT_* variables used by
// the email service, which is a different Azure AD application with
// different permissions. Client-credentials (app-only) flow via
// @azure/identity, mirroring services/email/providers/microsoft-graph.provider.ts.
//
// Required Microsoft Graph APPLICATION permissions (tenant admin consent
// required — cannot be granted by this code, see the final audit report):
//   - ChannelMessage.Send      — post a message to a channel as the app
//   - ChannelMember.Read.All   — list a channel's members
// ============================================================================

import 'isomorphic-fetch'
import { Client } from '@microsoft/microsoft-graph-client'
import { ClientSecretCredential } from '@azure/identity'
import { TEAMS_LOG_PREFIX } from './teams.constants'
import type { AdaptiveCard, TeamsSendResult, GraphTeamsMember } from './teams.types'

export type { GraphTeamsMember }

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'
const MEMBER_CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes — "cache to avoid excessive Graph calls" / "refresh when necessary"

export interface GraphConfig {
  tenantId: string
  clientId: string
  clientSecret: string
}

function getGraphConfig(): GraphConfig | null {
  const tenantId = process.env.TEAMS_TENANT_ID
  const clientId = process.env.TEAMS_CLIENT_ID
  const clientSecret = process.env.TEAMS_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) return null
  return { tenantId, clientId, clientSecret }
}

/** True when the Graph app registration is configured — never throws. */
export function isGraphMentionsConfigured(): boolean {
  return getGraphConfig() !== null
}

let credential: ClientSecretCredential | null = null
let graphClient: Client | null = null

function getGraphClient(): Client {
  if (graphClient) return graphClient

  const config = getGraphConfig()
  if (!config) {
    throw new Error('Missing TEAMS_TENANT_ID / TEAMS_CLIENT_ID / TEAMS_CLIENT_SECRET')
  }

  credential = new ClientSecretCredential(config.tenantId, config.clientId, config.clientSecret)

  graphClient = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential!.getToken(GRAPH_SCOPE)
        if (!token?.token) throw new Error('Failed to acquire Microsoft Graph access token')
        return token.token
      },
    },
  })

  return graphClient
}

/** Sanitized error shape — NEVER includes a token, secret, or webhook URL. */
export interface GraphCallError {
  message: string
  statusCode?: number
  code?: string
  /** Set when the failure is specifically a missing/unconsented permission. */
  missingPermission?: string
}

function sanitizeGraphError(err: unknown, requiredPermissionHint: string): GraphCallError {
  const e = err as { statusCode?: number; code?: string; message?: string; body?: string }
  const statusCode = e?.statusCode
  const code = e?.code
  const message = e?.message || 'Unknown Graph error'

  if (statusCode === 401) {
    return { message: 'Microsoft Graph authentication failed (invalid or expired app credentials).', statusCode, code }
  }
  if (statusCode === 403 || code === 'Authorization_RequestDenied' || code === 'Forbidden') {
    console.error(
      TEAMS_LOG_PREFIX + ' Graph permission missing — the app registration (TEAMS_CLIENT_ID) needs the ' +
      requiredPermissionHint + ' APPLICATION permission, with tenant admin consent granted.',
    )
    return {
      message: 'Microsoft Graph denied this request — the required permission (' + requiredPermissionHint + ') is not granted.',
      statusCode,
      code,
      missingPermission: requiredPermissionHint,
    }
  }
  return { message, statusCode, code }
}

// ─── Member Lookup (cached) ─────────────────────────────────────────────────

interface MemberCacheEntry {
  members: GraphTeamsMember[]
  expiresAt: number
}

const memberCache = new Map<string, MemberCacheEntry>()

function cacheKey(teamId: string, channelId: string): string {
  return teamId + '::' + channelId
}

/** Drop a cached entry so the next lookup re-fetches immediately (manual refresh). */
export function invalidateChannelMembersCache(teamId: string, channelId: string): void {
  memberCache.delete(cacheKey(teamId, channelId))
}

export function clearChannelMembersCache(): void {
  memberCache.clear()
}

interface GraphConversationMember {
  '@odata.type'?: string
  userId?: string
  displayName?: string
  email?: string
}

/**
 * List the members of a specific Teams channel via Microsoft Graph.
 * Returns `{ members }` on success (possibly empty), or `{ error }` on
 * failure — NEVER throws, so callers can always degrade gracefully to a
 * plain (unmentioned) message instead of losing the notification entirely.
 */
export async function getChannelMembers(
  teamId: string,
  channelId: string,
  opts?: { forceRefresh?: boolean },
): Promise<{ members: GraphTeamsMember[]; error?: GraphCallError }> {
  const key = cacheKey(teamId, channelId)
  if (!opts?.forceRefresh) {
    const cached = memberCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return { members: cached.members }
    }
  }

  if (!isGraphMentionsConfigured()) {
    return { members: [], error: { message: 'Microsoft Graph is not configured for Teams (missing TEAMS_TENANT_ID/TEAMS_CLIENT_ID/TEAMS_CLIENT_SECRET).' } }
  }

  try {
    const client = getGraphClient()
    const response = await client
      .api(`/teams/${teamId}/channels/${channelId}/members`)
      .get()

    const rawMembers: GraphConversationMember[] = response?.value || []
    const members: GraphTeamsMember[] = rawMembers
      .filter((m) => !!m.userId && !!m.displayName)
      .map((m) => ({ id: m.userId as string, displayName: m.displayName as string, email: m.email }))

    memberCache.set(key, { members, expiresAt: Date.now() + MEMBER_CACHE_TTL_MS })
    console.log(TEAMS_LOG_PREFIX + ' Resolved ' + members.length + ' channel member(s) for teamId/channelId pair (Graph).')
    return { members }
  } catch (err) {
    const error = sanitizeGraphError(err, 'ChannelMember.Read.All')
    console.error(TEAMS_LOG_PREFIX + ' Channel member lookup failed: ' + error.message)
    return { members: [], error }
  }
}

// ─── Mention-Capable Message Send ───────────────────────────────────────────

export interface GraphChatMessageBody {
  body: { contentType: 'html'; content: string }
  attachments: Array<{ id: string; contentType: string; content: string }>
  mentions?: Array<{ id: number; mentionText: string; mentioned: { user: { id: string; displayName: string; userIdentityType: 'aadUser' } } }>
}

/**
 * Pure builder — turns a resolved member list + card into the exact Graph
 * `chatMessage` request body, with a REAL mention entity per member (Graph's
 * documented `mentions` array bound to each member's Azure AD object ID —
 * this is what makes Teams deliver an actual notification to that person,
 * unlike the plain `<at>` text the webhook path uses as a best-effort visual
 * pill only). No I/O — safe to unit test without a network/Graph client.
 * When `members` is empty, returns a body with NO mentions field at all
 * (never fabricates an "@everyone"/"@channel" mention).
 */
export function buildMentionMessageBody(card: AdaptiveCard, members: GraphTeamsMember[], attachmentId?: string): GraphChatMessageBody {
  const id = attachmentId || 'card_' + Date.now().toString(36)
  const mentions = members.map((m, idx) => ({
    id: idx,
    mentionText: m.displayName,
    mentioned: { user: { id: m.id, displayName: m.displayName, userIdentityType: 'aadUser' as const } },
  }))

  const mentionTags = mentions.map((m) => `<at id="${m.id}">${escapeHtml(m.mentionText)}</at>`).join(' ')
  const content = (mentionTags ? mentionTags + ' ' : '') + `<attachment id="${id}"></attachment>`

  const result: GraphChatMessageBody = {
    body: { contentType: 'html', content },
    attachments: [
      { id, contentType: 'application/vnd.microsoft.card.adaptive', content: JSON.stringify(card) },
    ],
  }
  if (mentions.length > 0) result.mentions = mentions
  return result
}

/**
 * Post an Adaptive Card to a Teams channel via Microsoft Graph, with a real
 * @mention entity for every given member (triggers each member's actual
 * Teams notification — this is the documented `chatMessage.mentions`
 * mechanism, not plain `<at>` text). When `members` is empty, posts the card
 * with no mentions (never fabricates an "@everyone"/"@channel" mention).
 */
export async function sendChannelMessageWithMentions(params: {
  teamId: string
  channelId: string
  card: AdaptiveCard
  members: GraphTeamsMember[]
}): Promise<TeamsSendResult> {
  const startTime = Date.now()

  if (!isGraphMentionsConfigured()) {
    return { success: false, message: 'Graph not configured', error: 'Missing TEAMS_TENANT_ID/TEAMS_CLIENT_ID/TEAMS_CLIENT_SECRET' }
  }

  const body = buildMentionMessageBody(params.card, params.members)
  const mentions = body.mentions || []

  try {
    const client = getGraphClient()
    const response = await client
      .api(`/teams/${params.teamId}/channels/${params.channelId}/messages`)
      .post(body)

    const duration = Date.now() - startTime
    console.log(
      TEAMS_LOG_PREFIX + ' Graph channel message sent with ' + mentions.length +
      ' mention(s) (' + duration + 'ms).',
    )
    return {
      success: true,
      message: 'Sent via Microsoft Graph with ' + mentions.length + ' mention(s)',
      messageId: response?.id ? 'graph_' + response.id : undefined,
      durationMs: duration,
    }
  } catch (err) {
    const duration = Date.now() - startTime
    const error = sanitizeGraphError(err, 'ChannelMessage.Send')
    console.error(TEAMS_LOG_PREFIX + ' Graph channel message send failed: ' + error.message)
    return {
      success: false,
      message: 'Graph message send failed',
      error: error.message,
      errorCode: error.code,
      statusCode: error.statusCode,
      durationMs: duration,
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Test-only: verify the Graph app credentials can acquire a token. */
export async function verifyGraphMentionsConnection(): Promise<boolean> {
  try {
    const config = getGraphConfig()
    if (!config) return false
    const cred = new ClientSecretCredential(config.tenantId, config.clientId, config.clientSecret)
    const token = await cred.getToken(GRAPH_SCOPE)
    return !!token?.token
  } catch (error) {
    console.error(TEAMS_LOG_PREFIX + ' Graph mentions auth check failed: ' + (error instanceof Error ? error.message : error))
    return false
  }
}
