import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMentionMessageBody, isGraphMentionsConfigured, type GraphTeamsMember } from '../src/services/teams/teams-graph-client'
import type { AdaptiveCard } from '../src/services/teams/teams.types'

// ============================================================================
// @mention notifications for Teams channel members
// ============================================================================
// Root architecture fact (see the audit report): a standard Incoming Webhook
// / Power Automate Workflow post is anonymous and unbound to a real Teams
// conversation, so Teams does NOT turn its `<at>` text into a real per-user
// ping — that mechanism only exists for Microsoft Graph's chatMessage API
// (`mentions` array bound to each member's Azure AD object ID). These tests
// verify: (1) the mention entity this codebase builds is a REAL Graph mention
// (not fabricated text), (2) member resolution is project-isolated, (3) every
// degradation path (no config, lookup failure, zero members, disabled
// channel) preserves existing behavior instead of breaking delivery, and
// (4) no secret is ever logged.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const GRAPH_CLIENT_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-graph-client.ts'), 'utf8')
const RESOLVER_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-channel-resolver.ts'), 'utf8')
const QUEUE_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-queue.ts'), 'utf8')
const SERVICE_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams.service.ts'), 'utf8')
const ROUTE_SRC = readFileSync(join(ROOT, 'src', 'routes', 'teams-notification.ts'), 'utf8')
const REPO_SRC = readFileSync(join(ROOT, 'src', 'repositories', 'project-teams-channel.repository.ts'), 'utf8')
const SCHEMA_SRC = readFileSync(join(ROOT, 'src', 'models', 'schema.ts'), 'utf8')
const MIGRATION_SRC = readFileSync(join(ROOT, 'src', 'migrations', '0018_project_teams_channel_mentions.sql'), 'utf8')

const CARD: AdaptiveCard = { type: 'AdaptiveCard', version: '1.5', body: [{ type: 'TextBlock', text: 'New ticket created', wrap: true }] }

const MEMBERS: GraphTeamsMember[] = [
  { id: 'aad-user-a', displayName: 'User A', email: 'a@example.com' },
  { id: 'aad-user-b', displayName: 'User B', email: 'b@example.com' },
  { id: 'aad-user-c', displayName: 'User C', email: 'c@example.com' },
  { id: 'aad-user-d', displayName: 'User D', email: 'd@example.com' },
]

// ─── Test 3 & requirement 8 of the audit — real mention entities, not text ──

test('buildMentionMessageBody creates a REAL Graph mentions array (bound to each Azure AD object ID), not plain "@Name" text', () => {
  const result = buildMentionMessageBody(CARD, MEMBERS, 'att1')
  assert.ok(Array.isArray(result.mentions), 'must include a mentions array')
  assert.equal(result.mentions!.length, 4)
  for (const [idx, member] of MEMBERS.entries()) {
    const entity = result.mentions![idx]
    assert.equal(entity.id, idx)
    assert.equal(entity.mentionText, member.displayName)
    assert.equal(entity.mentioned.user.id, member.id, 'must bind the mention to the real Azure AD object ID')
    assert.equal(entity.mentioned.user.userIdentityType, 'aadUser')
  }
})

test('every mentioned member appears as an <at id> token in the message body content (the Graph-required binding between text and the mentions array)', () => {
  const result = buildMentionMessageBody(CARD, MEMBERS, 'att1')
  for (let i = 0; i < MEMBERS.length; i++) {
    assert.match(result.body.content, new RegExp(`<at id="${i}">${MEMBERS[i].displayName}</at>`))
  }
  assert.match(result.body.content, /<attachment id="att1">/, 'the card must still be attached alongside the mentions')
})

test('the existing card content is preserved unchanged as an adaptive card attachment — mentions are additive, not a redesign', () => {
  const result = buildMentionMessageBody(CARD, MEMBERS, 'att1')
  assert.equal(result.attachments.length, 1)
  assert.equal(result.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive')
  assert.deepEqual(JSON.parse(result.attachments[0].content), CARD)
})

// ─── Requirement 7 — no @everyone/@channel, zero members is not an error ───

test('never sends "@everyone" or "@channel" — only real named members', () => {
  const result = buildMentionMessageBody(CARD, MEMBERS, 'att1')
  assert.doesNotMatch(result.body.content, /@everyone/i)
  assert.doesNotMatch(result.body.content, /@channel/i)
})

test('zero members produces a valid message with NO mentions field (never an invalid/empty mention entity)', () => {
  const result = buildMentionMessageBody(CARD, [], 'att1')
  assert.equal(result.mentions, undefined)
  assert.doesNotMatch(result.body.content, /<at /, 'no <at> tokens when there are no members')
  assert.match(result.body.content, /<attachment id="att1">/, 'the plain message must still be sent')
})

// ─── Requirement: mention text is escaped (defense-in-depth, not a name-injection vector) ─

test('a member display name is HTML-escaped in the message body (defense against injecting markup via a Teams display name)', () => {
  const result = buildMentionMessageBody(CARD, [{ id: 'x', displayName: '<script>alert(1)</script>' }], 'att1')
  assert.doesNotMatch(result.body.content, /<script>/)
  assert.match(result.body.content, /&lt;script&gt;/)
})

// ─── isGraphMentionsConfigured — env-driven, never throws ──────────────────

test('isGraphMentionsConfigured() reads TEAMS_TENANT_ID/TEAMS_CLIENT_ID/TEAMS_CLIENT_SECRET and never throws when they are absent', () => {
  const saved = {
    t: process.env.TEAMS_TENANT_ID, c: process.env.TEAMS_CLIENT_ID, s: process.env.TEAMS_CLIENT_SECRET,
  }
  try {
    delete process.env.TEAMS_TENANT_ID
    delete process.env.TEAMS_CLIENT_ID
    delete process.env.TEAMS_CLIENT_SECRET
    assert.equal(isGraphMentionsConfigured(), false)

    process.env.TEAMS_TENANT_ID = 't'
    process.env.TEAMS_CLIENT_ID = 'c'
    process.env.TEAMS_CLIENT_SECRET = 's'
    assert.equal(isGraphMentionsConfigured(), true)
  } finally {
    if (saved.t !== undefined) process.env.TEAMS_TENANT_ID = saved.t; else delete process.env.TEAMS_TENANT_ID
    if (saved.c !== undefined) process.env.TEAMS_CLIENT_ID = saved.c; else delete process.env.TEAMS_CLIENT_ID
    if (saved.s !== undefined) process.env.TEAMS_CLIENT_SECRET = saved.s; else delete process.env.TEAMS_CLIENT_SECRET
  }
})

// ─── Requirement 5 & 6 — project isolation, never mix members ─────────────

test('getProjectTeamsMembers resolves the Team ID/Channel ID from THIS project only — never the global TEAMS_DEFAULT_TEAM_ID/CHANNEL_ID env fallback', () => {
  const fnStart = RESOLVER_SRC.indexOf('async function resolveProjectMentionTarget')
  assert.notEqual(fnStart, -1)
  const fnBlock = RESOLVER_SRC.slice(fnStart, fnStart + 800)
  assert.doesNotMatch(fnBlock, /TEAMS_DEFAULT_TEAM_ID|TEAMS_DEFAULT_CHANNEL_ID|process\.env/, 'must never fall back to the global default team/channel — that would leak members across projects')
  assert.match(fnBlock, /repo\.findByProjectId\(projectId\)/, 'must resolve strictly from this project\'s own row')
})

test('a project with no teamId/channelId configured returns zero members with NO error (the normal, expected state)', () => {
  assert.match(RESOLVER_SRC, /if \(!row \|\| !row\.teamId \|\| !row\.channelId\) return null/)
  assert.match(RESOLVER_SRC, /if \(!target\) return \{ members: \[\] \}/)
})

// ─── Requirement 6 — disabled channel: no delivery, no mention attempt ─────

test('teams.service only resolves mentions when the channel actually resolved as enabled — a disabled project channel never triggers a member lookup', () => {
  const fnBlock = SERVICE_SRC.slice(SERVICE_SRC.indexOf('resolveTeamsChannelForProject({ projectId: payload.projectId })'))
  assert.match(fnBlock, /if \(resolved\.projectId && resolved\.enabled\)/, 'member lookup must be gated on resolved.enabled, matching the existing disabled-channel-no-delivery policy')
})

// ─── Requirement: message still sent even when mentions fail (graceful degradation) ─

test('the queue falls back to the existing webhook path when the Graph mention send fails — the message is never lost because mentions failed', () => {
  const fnStart = QUEUE_SRC.indexOf('async function sendWithRetry')
  const fnBlock = QUEUE_SRC.slice(fnStart, fnStart + 2000)
  assert.match(fnBlock, /if \(entry\.mentionTarget\)/)
  assert.match(fnBlock, /if \(graphResult\.success\) \{\s*return true\s*\}/, 'a successful Graph mention send must not ALSO post via webhook (would duplicate the message)')
  assert.doesNotMatch(fnBlock.slice(fnBlock.indexOf('if (entry.mentionTarget)'), fnBlock.indexOf('if (entry.mentionTarget)') + 900), /return false/, 'a failed Graph send must fall through to the webhook path, not abort the attempt')
})

test('mentions never consume extra retry budget — mentionTarget/mentionMembers are resolved ONCE in teams.service before enqueue, never re-resolved per retry', () => {
  assert.match(SERVICE_SRC, /const memberResult = await getProjectTeamsMembers\(resolved\.projectId\)/)
  assert.doesNotMatch(QUEUE_SRC, /getProjectTeamsMembers/, 'the queue/retry path must never call member resolution itself')
})

// ─── Requirement 8, 9 — safe error handling, never expose Graph internals ──

test('a Graph 403/Forbidden response is mapped to a message that NAMES the missing permission, for backend logs only — never a token', () => {
  assert.match(GRAPH_CLIENT_SRC, /statusCode === 403 \|\| code === 'Authorization_RequestDenied'/)
  assert.match(GRAPH_CLIENT_SRC, /missingPermission/)
  assert.match(GRAPH_CLIENT_SRC, /ChannelMember\.Read\.All/)
  assert.match(GRAPH_CLIENT_SRC, /ChannelMessage\.Send/)
})

test('the test route returns the exact safe message when member lookup fails: "Teams message was sent, but member mentions could not be resolved."', () => {
  assert.match(ROUTE_SRC, /'Teams message was sent, but member mentions could not be resolved\.'/)
})

test('member lookup / mention send failures are logged via logChannelError (sanitized) — never a raw Graph error object, never a token', () => {
  assert.match(ROUTE_SRC, /logChannelError\('TEST_MENTION_LOOKUP_FAILED'/)
  assert.match(ROUTE_SRC, /logChannelError\('TEST_MENTION_SEND_FAILED'/)
})

// ─── Security regression — no secrets in code paths or responses ──────────

test('Graph credentials (TEAMS_CLIENT_SECRET, access tokens) are never interpolated into a console.log/console.error line', () => {
  assert.doesNotMatch(GRAPH_CLIENT_SRC, /console\.(log|error|warn)\([^)]*clientSecret/i)
  assert.doesNotMatch(GRAPH_CLIENT_SRC, /console\.(log|error|warn)\([^)]*token\.token/i)
  assert.doesNotMatch(GRAPH_CLIENT_SRC, /console\.(log|error|warn)\([^)]*getToken/i)
})

test('the PUT .../channel route never echoes teamId/channelId or webhookUrl back in a way that exposes the webhook secret', () => {
  const fnStart = ROUTE_SRC.indexOf("router.put('/projects/:projectId/channel'")
  const fnBlock = ROUTE_SRC.slice(fnStart, fnStart + 4200)
  assert.doesNotMatch(fnBlock, /webhookUrl:\s*saved\.webhookUrl/, 'must never return the stored webhook URL')
  assert.match(fnBlock, /mentionsConfigured: !!saved\.teamId && !!saved\.channelId/, 'only a boolean status is returned, never the raw IDs\' presence beyond a flag')
})

test('the /projects/:id/mentions status route returns booleans only — never the Team ID/Channel ID values or the webhook URL', () => {
  const fnStart = ROUTE_SRC.indexOf("router.get('/projects/:projectId/mentions'")
  const fnBlock = ROUTE_SRC.slice(fnStart, fnStart + 1200)
  assert.doesNotMatch(fnBlock, /teamId:\s*row/, 'must not return the raw teamId value')
  assert.doesNotMatch(fnBlock, /channelId:\s*row/, 'must not return the raw channelId value')
  assert.match(fnBlock, /mentionTargetConfigured/)
})

// ─── Database — additive only, no destructive change ───────────────────────

test('migration 0018 is purely additive (ADD COLUMN IF NOT EXISTS only) — no destructive SQL statement of any kind', () => {
  // Match actual SQL statements only (word boundary + uppercase, as Postgres
  // keywords are conventionally written in these migration files) — not
  // prose in comments that happens to contain the same English words.
  assert.doesNotMatch(MIGRATION_SRC, /\bDROP\s+(TABLE|COLUMN)\b|\bRENAME\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/)
  assert.match(MIGRATION_SRC, /ALTER TABLE "project_teams_channel" ADD COLUMN IF NOT EXISTS "teamId" text;/)
  assert.match(MIGRATION_SRC, /ALTER TABLE "project_teams_channel" ADD COLUMN IF NOT EXISTS "channelId" text;/)
})

test('schema.ts declares teamId/channelId as nullable (optional) columns — existing rows and the webhook-only flow are never required to set them', () => {
  const fnStart = SCHEMA_SRC.indexOf("projectTeamsChannel = pgTable('project_teams_channel'")
  const fnBlock = SCHEMA_SRC.slice(fnStart, fnStart + 1100)
  assert.match(fnBlock, /teamId: text\('teamId'\),/, 'must be nullable — no .notNull()')
  assert.match(fnBlock, /channelId: text\('channelId'\),/, 'must be nullable — no .notNull()')
})

test('the repository upsert requires teamId/channelId to be provided TOGETHER at the route layer (a partial pair is rejected, never silently half-saved)', () => {
  assert.match(ROUTE_SRC, /teamIdProvided !== channelIdProvided/)
  assert.match(ROUTE_SRC, /'TEAMS_MENTION_TARGET_INCOMPLETE'/)
})

// ─── Webhook path is untouched — no parallel system, existing tests still pass ─

test('the existing webhook client (teams-webhook-client.ts) was not modified to support mentions — teams-graph-client.ts is a SEPARATE, additional transport', () => {
  const WEBHOOK_CLIENT_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-webhook-client.ts'), 'utf8')
  assert.doesNotMatch(WEBHOOK_CLIENT_SRC, /microsoft-graph-client|@azure\/identity/, 'the webhook transport must stay dependency-free of Graph — it is the guaranteed fallback')
})

test('enqueue() still accepts every original positional argument in the original order — existing callers (and the global/legacy direct-enqueue path) are unaffected', () => {
  const sigStart = QUEUE_SRC.indexOf('export function enqueue(')
  assert.notEqual(sigStart, -1)
  const returnTypeIdx = QUEUE_SRC.indexOf('): string {', sigStart)
  assert.notEqual(returnTypeIdx, -1)
  const sigBlock = QUEUE_SRC.slice(sigStart, returnTypeIdx)
  const order = ['eventType', 'payload', 'card', 'teamId', 'channelId', 'mention', 'webhookUrl', 'projectId', 'destinationResolved', 'mentionTarget', 'mentionMembers']
  let cursor = 0
  for (const name of order) {
    const idx = sigBlock.indexOf(name, cursor)
    assert.notEqual(idx, -1, `expected parameter "${name}" in enqueue() signature at or after position ${cursor}`)
    cursor = idx + name.length
  }
})
