import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  mergeProjectPreferenceOverClient,
  isNotificationEnabled,
  canonicalNotificationEvent,
} from '../src/lib/notification-preferences'
import * as projectPrefRepo from '../src/repositories/project-notification-preference.repository'
import { getProjectPreferenceContext, loadMergedPreferenceMap } from '../src/services/notification-preference.service'
import { db } from '../src/config/db'
import { project, user, projectNotificationPreference } from '../src/models/schema'
import { eq } from 'drizzle-orm'

// ============================================================================
// Project-wise CLIENT notification preferences
// ============================================================================
// Covers: resolution (project preference wins, absent row = default),
// project isolation (never leaks between projects), duplicate prevention
// (unique project+channel+event), and — the substantive fix this phase made
// — that project preferences are a CLIENT-ONLY concept: internal-staff
// recipients (admin/project_manager/developer) are never gated by them.
// ============================================================================

const ROOT = join(import.meta.dirname, '..')
const TEAMS_ROUTE_SRC = readFileSync(join(ROOT, 'src', 'routes', 'teams-notification.ts'), 'utf8')
const EMAIL_ROUTE_SRC = readFileSync(join(ROOT, 'src', 'routes', 'email-notification.ts'), 'utf8')
const PROJECT_PREF_ROUTE_SRC = readFileSync(join(ROOT, 'src', 'routes', 'project-notification-preferences.ts'), 'utf8')
const SCHEMA_SRC = readFileSync(join(ROOT, 'src', 'models', 'schema.ts'), 'utf8')

// ─── Pure merge/default logic (no DB) ──────────────────────────────────────

test('mergeProjectPreferenceOverClient: an absent key falls through to the built-in default (never accidentally disabled)', () => {
  const merged = mergeProjectPreferenceOverClient([], [])
  const enabled = isNotificationEnabled(merged, 'email', 'ticket_created', { role: 'client' })
  assert.equal(enabled, true, 'missing preference row must default to enabled, not disabled')
})

test('mergeProjectPreferenceOverClient: a PROJECT row always wins over a legacy CLIENT row for the same (channel, event)', () => {
  const projectRows = [{ projectId: 1, channel: 'email', eventType: 'ticket_created', enabled: false }]
  const clientRows = [{ clientId: 'c1', channel: 'email', eventType: 'ticket_created', enabled: true }]
  const merged = mergeProjectPreferenceOverClient(projectRows, clientRows)
  assert.equal(isNotificationEnabled(merged, 'email', 'ticket_created', { role: 'client' }), false)
})

test('mergeProjectPreferenceOverClient: a legacy CLIENT row is used ONLY when the project has no explicit row for that (channel, event) — inheritance fallback, no data loss', () => {
  const projectRows = [{ projectId: 1, channel: 'email', eventType: 'ticket_created', enabled: false }]
  const clientRows = [
    { clientId: 'c1', channel: 'email', eventType: 'ticket_created', enabled: true }, // overridden by project
    { clientId: 'c1', channel: 'teams', eventType: 'estimate_approved', enabled: false }, // no project row — inherited
  ]
  const merged = mergeProjectPreferenceOverClient(projectRows, clientRows)
  assert.equal(isNotificationEnabled(merged, 'email', 'ticket_created', { role: 'client' }), false, 'project row wins')
  assert.equal(isNotificationEnabled(merged, 'teams', 'estimate_approved', { role: 'client' }), false, 'client row inherited when project has none')
})

// ─── Client-only scope — the substantive fix this phase made ──────────────

test('Teams route: project-wise preferences are consulted ONLY for role==="client" recipients — internal staff always take the account-level branch', () => {
  assert.match(TEAMS_ROUTE_SRC, /if \(teamsPayload\.projectId && recipient\.role === 'client'\)/)
  assert.doesNotMatch(TEAMS_ROUTE_SRC, /if \(teamsPayload\.projectId\)\s*\{\s*\n\s*\/\/ PROJECT-wise \(authoritative for every recipient\)/, 'the old "applies to every recipient" branch must be gone')
})

test('Email route: project-wise preferences are consulted ONLY for client-role addresses — internal-staff addresses fall through to legacyEnabled()', () => {
  const fnStart = EMAIL_ROUTE_SRC.indexOf('async function filterByEmailPreferences')
  const fnBlock = EMAIL_ROUTE_SRC.slice(fnStart, fnStart + 3500)
  assert.match(fnBlock, /if \(role === 'client'\) \{/)
  assert.match(fnBlock, /return legacyEnabled\(u\)/, 'internal-staff addresses must fall back to the legacy per-user resolution, never the project map')
})

test('Frontend in-app dispatcher: project preferences gate CLIENT recipients only (notify-all.ts)', () => {
  const NOTIFY_ALL_SRC = readFileSync(join(ROOT, '..', 'Frontend', 'lib', 'notify-all.ts'), 'utf8')
  assert.match(NOTIFY_ALL_SRC, /projectDisabledInApp && user\.role === 'client'/)
  // The legacy per-user map must be loaded unconditionally (not skipped just
  // because a project context exists) so internal-staff recipients always
  // have their own preferences available as the fallback.
  assert.match(NOTIFY_ALL_SRC, /const disabledInApp = await loadDisabledInAppEvents\(userIds\)/)
})

// ─── Authorization — enforced server-side, never trusts the frontend ──────

test('project-notification-preferences route: admin can access any project, project_manager only their own, everyone else is denied — all enforced in authorizeProjectAccess, not the UI', () => {
  const fnStart = PROJECT_PREF_ROUTE_SRC.indexOf('async function authorizeProjectAccess')
  const fnBlock = PROJECT_PREF_ROUTE_SRC.slice(fnStart, PROJECT_PREF_ROUTE_SRC.indexOf('\n}\n', fnStart))
  assert.match(fnBlock, /const projectRow = await projectRepo\.findById\(projectId\)/, 'the project must be verified against the database, never trusted from the request alone')
  assert.match(fnBlock, /if \(!projectRow\) \{\s*\n\s*return res\.status\(404\)/)
  assert.match(fnBlock, /if \(user\.role === 'admin'\) return next\(\)/)
  assert.match(fnBlock, /if \(user\.role === 'project_manager'\)/)
  assert.match(fnBlock, /if \(projectRow\.managerId === user\.id\) return next\(\)/)
  assert.match(fnBlock, /return res\.status\(403\)/)
})

test('both GET and PUT routes require authentication AND authorizeProjectAccess — a client/developer can never reach either', () => {
  assert.match(PROJECT_PREF_ROUTE_SRC, /router\.get\('\/:projectId\/notification-preferences', requireAuth, authorizeProjectAccess/)
  assert.match(PROJECT_PREF_ROUTE_SRC, /router\.put\('\/:projectId\/notification-preferences', requireAuth, authorizeProjectAccess/)
})

// ─── Database — additive schema, unique constraint prevents duplicates ────

test('project_notification_preferences has a UNIQUE index on (projectId, channel, eventType) — a project can never have duplicate rows for the same channel/event', () => {
  const start = SCHEMA_SRC.indexOf("projectNotificationPreference = pgTable('project_notification_preferences'")
  assert.notEqual(start, -1)
  const block = SCHEMA_SRC.slice(start, start + 700)
  assert.match(block, /uniqueIndex\('project_notif_pref_project_channel_event_idx'\)\.on\(table\.projectId, table\.channel, table\.eventType\)/)
})

// ─── Real DB round-trip: resolution, isolation, duplicate prevention ──────
// Uses a scratch project created and destroyed within this test file — never
// touches real project/client data. Skips gracefully if no DATABASE_URL is
// configured in this environment (matches this repo's other DB-backed tests).

async function withScratchProjects(fn: (ids: { projectA: number; projectB: number; clientId: string }) => Promise<void>) {
  if (!process.env.DATABASE_URL) return
  const [existingClient] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'client')).limit(1)
  const [existingManager] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'project_manager')).limit(1)
  if (!existingClient || !existingManager) return // no fixture data available in this environment

  const [projectA] = await db.insert(project).values({
    projectName: 'TEST-SCRATCH-A-' + Date.now(), projectCode: 'TSA' + Date.now().toString(36).slice(-6),
    clientId: existingClient.id, managerId: existingManager.id, status: 'active',
  }).returning({ id: project.id })
  const [projectB] = await db.insert(project).values({
    projectName: 'TEST-SCRATCH-B-' + Date.now(), projectCode: 'TSB' + Date.now().toString(36).slice(-6),
    clientId: existingClient.id, managerId: existingManager.id, status: 'active',
  }).returning({ id: project.id })

  try {
    await fn({ projectA: projectA.id, projectB: projectB.id, clientId: existingClient.id })
  } finally {
    await db.delete(projectNotificationPreference).where(eq(projectNotificationPreference.projectId, projectA.id))
    await db.delete(projectNotificationPreference).where(eq(projectNotificationPreference.projectId, projectB.id))
    await db.delete(project).where(eq(project.id, projectA.id))
    await db.delete(project).where(eq(project.id, projectB.id))
  }
}

test('DB: Project A preference ON -> resolution says enabled; OFF -> resolution says disabled', async () => {
  await withScratchProjects(async ({ projectA }) => {
    await projectPrefRepo.upsertForProject(projectA, 'email', 'ticket_created', true)
    let merged = await loadMergedPreferenceMap(projectA)
    assert.equal(isNotificationEnabled(merged, 'email', 'ticket_created', { role: 'client' }), true)

    await projectPrefRepo.upsertForProject(projectA, 'email', 'ticket_created', false)
    merged = await loadMergedPreferenceMap(projectA)
    assert.equal(isNotificationEnabled(merged, 'email', 'ticket_created', { role: 'client' }), false)
  })
})

test('DB: Project A and Project B resolve INDEPENDENTLY — a preference on one never leaks into the other', async () => {
  await withScratchProjects(async ({ projectA, projectB }) => {
    await projectPrefRepo.upsertForProject(projectA, 'email', 'estimate_approved', false)
    await projectPrefRepo.upsertForProject(projectB, 'email', 'estimate_approved', true)

    const mergedA = await loadMergedPreferenceMap(projectA)
    const mergedB = await loadMergedPreferenceMap(projectB)

    assert.equal(isNotificationEnabled(mergedA, 'email', 'estimate_approved', { role: 'client' }), false, 'Project A must use its OWN preference')
    assert.equal(isNotificationEnabled(mergedB, 'email', 'estimate_approved', { role: 'client' }), true, 'Project B must use its OWN preference, not A\'s')
  })
})

test('DB: a disabled project preference does NOT fall back to another project — resolving Project A never reads Project B\'s row', async () => {
  await withScratchProjects(async ({ projectA, projectB }) => {
    await projectPrefRepo.upsertForProject(projectB, 'teams', 'revision_requested', true)
    // Project A has NO row at all for this event.
    const rowsA = await projectPrefRepo.findByProjectId(projectA)
    assert.equal(rowsA.find(r => r.eventType === 'revision_requested'), undefined, 'Project A must not see Project B\'s row')
  })
})

test('DB: upsertForProject is idempotent per (project, channel, event) — calling it twice never creates a duplicate row', async () => {
  await withScratchProjects(async ({ projectA }) => {
    await projectPrefRepo.upsertForProject(projectA, 'in_app', 'ticket_assigned', true)
    await projectPrefRepo.upsertForProject(projectA, 'in_app', 'ticket_assigned', false)
    const rows = (await projectPrefRepo.findByProjectId(projectA)).filter(r => r.channel === 'in_app' && r.eventType === 'ticket_assigned')
    assert.equal(rows.length, 1, 'exactly one row must exist for this (project, channel, event) — no duplicate')
    assert.equal(rows[0].enabled, false, 'the row must reflect the LATEST upsert')
  })
})

test('DB: getProjectPreferenceContext resolves the project\'s real clientId from the database — never trusts a caller-supplied value', async () => {
  await withScratchProjects(async ({ projectA, clientId }) => {
    const ctx = await getProjectPreferenceContext(projectA)
    assert.equal(ctx.projectId, projectA)
    assert.equal(ctx.clientId, clientId)
  })
})

test('DB: getProjectPreferenceContext throws for a nonexistent project (never silently returns a default context)', async () => {
  if (!process.env.DATABASE_URL) return
  await assert.rejects(() => getProjectPreferenceContext(999999999))
})
