import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolveTeamsChannelFromInputs,
  toTeamsConfig,
} from '../src/services/teams/teams-channel-resolver'
import { validateTeamsWebhookUrl } from '../src/services/teams/teams-config-validator'

const ROOT = join(import.meta.dirname, '..')
const FRONTEND_ROOT = join(ROOT, '..', 'Frontend')

const SERVICE_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams.service.ts'), 'utf8')
const QUEUE_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-queue.ts'), 'utf8')
const RESOLVER_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-channel-resolver.ts'), 'utf8')
const VALIDATOR_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-config-validator.ts'), 'utf8')
const WEBHOOK_CLIENT_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-webhook-client.ts'), 'utf8')
const ROUTE_SRC = readFileSync(join(ROOT, 'src', 'routes', 'teams-notification.ts'), 'utf8')
const REPO_SRC = readFileSync(join(ROOT, 'src', 'repositories', 'project-teams-channel.repository.ts'), 'utf8')
const DISPATCHER_SRC = readFileSync(join(ROOT, 'src', 'lib', 'notification-dispatcher.ts'), 'utf8')
const BACKEND_SCHEMA_SRC = readFileSync(join(ROOT, 'src', 'models', 'schema.ts'), 'utf8')

const CHANNEL_A = 'https://prod-01.westus.logic.azure.com/workflows/a/triggers/manual/paths/invoke?sig=AAA'
const CHANNEL_B = 'https://prod-02.eastus.logic.azure.com/workflows/b/triggers/manual/paths/invoke?sig=BBB'
const CHANNEL_C = 'https://contoso.webhook.office.com/webhookb2/ccc'
const GLOBAL = 'https://prod-99.westus.logic.azure.com/workflows/global/triggers/manual/paths/invoke?sig=GLOBAL'

// ─── Channel link validation ────────────────────────────────────────────────
// A bad link must be rejected with a useful, non-secret message.

test('validateTeamsWebhookUrl accepts real Teams webhook hosts (Power Automate + Incoming Webhook)', () => {
  for (const url of [CHANNEL_A, CHANNEL_B, CHANNEL_C, 'https://default123abc.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/x/triggers/manual/paths/invoke?api-version=1&sig=Z']) {
    const result = validateTeamsWebhookUrl(url)
    assert.equal(result.valid, true, `${url} should be accepted`)
  }
})

test('validateTeamsWebhookUrl rejects non-Teams / insecure / malformed links', () => {
  const cases: Array<[string, string]> = [
    ['', 'required'],
    ['http://prod-01.westus.logic.azure.com/x', 'HTTPS'],
    ['not a url', 'valid URL'],
    ['https://evil.example.com/collect', 'Microsoft Teams webhook URL'],
    ['https://user:pass@contoso.webhook.office.com/hook', 'credentials'],
  ]
  for (const [url, expectedFragment] of cases) {
    const result = validateTeamsWebhookUrl(url)
    assert.equal(result.valid, false, `${url || '(empty)'} must be rejected`)
    assert.ok(result.message.includes(expectedFragment), `message should mention "${expectedFragment}", got: ${result.message}`)
  }
})

test('a rejected link never echoes the pasted value back (no secret in the error message)', () => {
  const secretish = 'https://evil.example.com/collect?sig=SUPER_SECRET_SIGNATURE'
  const result = validateTeamsWebhookUrl(secretish)
  assert.equal(result.valid, false)
  assert.ok(!result.message.includes('SUPER_SECRET_SIGNATURE'), 'the message must not contain any part of the pasted link')
  assert.ok(!JSON.stringify(result).includes('SUPER_SECRET_SIGNATURE'))
})

// ─── Per-project routing (multiple projects, different channels) ────────────

test('each project routes to its OWN Teams channel', () => {
  const projects: Record<number, string> = { 1: CHANNEL_A, 2: CHANNEL_B, 3: CHANNEL_C }
  for (const [projectId, url] of Object.entries(projects)) {
    const resolved = resolveTeamsChannelFromInputs({
      projectId: Number(projectId),
      projectChannel: { webhookUrl: url, enabled: true },
      globalWebhookUrl: GLOBAL,
    })
    assert.equal(resolved.source, 'project')
    assert.equal(resolved.webhookUrl, url, `project ${projectId} must use its own channel, not another project's`)
    assert.equal(resolved.projectId, Number(projectId))
    assert.equal(resolved.enabled, true)
  }
})

test('a project without a channel falls back to the global webhook (never another project\'s)', () => {
  const resolved = resolveTeamsChannelFromInputs({ projectId: 4, projectChannel: null, globalWebhookUrl: GLOBAL })
  assert.equal(resolved.source, 'global')
  assert.equal(resolved.webhookUrl, GLOBAL)
})

test('a project without a channel and no global webhook resolves to mock mode (no delivery)', () => {
  const resolved = resolveTeamsChannelFromInputs({ projectId: 5, projectChannel: null, globalWebhookUrl: undefined })
  assert.equal(resolved.source, 'none')
  assert.equal(resolved.enabled, false)
  assert.equal(resolved.webhookUrl, undefined)
  assert.equal(resolved.mockMode, true)
  assert.equal(resolved.reason, 'no_channel_configured')
})

test('a DISABLED project channel stops delivery — the global fallback is NOT used', () => {
  const resolved = resolveTeamsChannelFromInputs({
    projectId: 6,
    projectChannel: { webhookUrl: CHANNEL_A, enabled: false },
    globalWebhookUrl: GLOBAL,
  })
  assert.equal(resolved.source, 'none')
  assert.equal(resolved.webhookUrl, undefined)
  assert.equal(resolved.reason, 'project_channel_disabled')
})

test('an invalid stored project channel falls back to the global webhook (never delivers to the bad link)', () => {
  const resolved = resolveTeamsChannelFromInputs({
    projectId: 7,
    projectChannel: { webhookUrl: 'https://evil.example.com/steal?sig=BAD', enabled: true },
    globalWebhookUrl: GLOBAL,
  })
  assert.equal(resolved.source, 'global')
  assert.equal(resolved.webhookUrl, GLOBAL)
  assert.ok(!JSON.stringify(resolved).includes('evil.example.com'))
  assert.equal(resolved.reason, 'invalid_project_channel')
})

test('toTeamsConfig() turns the resolved channel into the exact transport config the queue uses', () => {
  const project = resolveTeamsChannelFromInputs({ projectId: 1, projectChannel: { webhookUrl: CHANNEL_A, enabled: true } })
  assert.deepEqual(toTeamsConfig(project), { webhookUrl: CHANNEL_A, enabled: true, mockMode: false })

  const none = resolveTeamsChannelFromInputs({ projectId: 1, projectChannel: null })
  assert.deepEqual(toTeamsConfig(none), { webhookUrl: undefined, enabled: false, mockMode: true })
})

// ─── Queue: per-entry destination + processing + retry ─────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

async function waitForQueueDrain(getDepth: () => number, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (getDepth() > 0 && Date.now() < deadline) await sleep(100)
}

test('a SERVICE-RESOLVED entry with no channel never falls back to the global env webhook', async () => {
  const original = process.env.TEAMS_WEBHOOK_URL
  // A configured global webhook would make a legacy queue attempt a REAL POST.
  process.env.TEAMS_WEBHOOK_URL = GLOBAL
  try {
    const teamsQueue = await import('../src/services/teams/teams-queue')
    const beforeProcessed = teamsQueue.getQueueStats().totalProcessed
    const beforeFailed = teamsQueue.getQueueStats().totalFailed

    // destinationResolved=true + no webhook → the service already decided there
    // is no destination (mock), despite the global env being set.
    teamsQueue.enqueue(
      'test_message' as any,
      {} as any,
      { type: 'AdaptiveCard', version: '1.0', body: [] } as any,
      '',
      '',
      null,
      undefined,
      undefined,
      true,
    )

    await waitForQueueDrain(() => teamsQueue.getQueueDepth())
    assert.equal(teamsQueue.getQueueDepth(), 0)
    assert.equal(teamsQueue.getQueueStats().totalProcessed, beforeProcessed + 1, 'must deliver via mock, not the global env webhook')
    assert.equal(teamsQueue.getQueueStats().totalFailed, beforeFailed, 'must not attempt a real POST to the global env webhook')
  } finally {
    if (original === undefined) delete process.env.TEAMS_WEBHOOK_URL
    else process.env.TEAMS_WEBHOOK_URL = original
  }
})

test('a LEGACY direct enqueue still honors the global env webhook (backward compatibility)', async () => {
  const original = process.env.TEAMS_WEBHOOK_URL
  // Unreachable-but-real HTTPS URL: the queue must ATTEMPT a real POST (and
  // fail), proving the global env is still used when teams.service did not
  // resolve the destination itself.
  process.env.TEAMS_WEBHOOK_URL = 'https://127.0.0.1:9/legacy-global'
  try {
    const teamsQueue = await import('../src/services/teams/teams-queue')
    const beforeFailed = teamsQueue.getQueueStats().totalFailed
    teamsQueue.enqueue('test_message' as any, {} as any, { type: 'AdaptiveCard', version: '1.0', body: [] } as any, '', '')
    await waitForQueueDrain(() => teamsQueue.getQueueDepth())
    assert.equal(teamsQueue.getQueueDepth(), 0)
    assert.ok(teamsQueue.getQueueStats().totalFailed > beforeFailed, 'legacy callers must still POST to the global env webhook')
  } finally {
    if (original === undefined) delete process.env.TEAMS_WEBHOOK_URL
    else process.env.TEAMS_WEBHOOK_URL = original
  }
})

test('queue delivers to the PROJECT webhook for that entry, retries, terminates on persistent failure, and never logs the URL', async () => {
  const teamsQueue = await import('../src/services/teams/teams-queue')
  const beforeFailed = teamsQueue.getQueueStats().totalFailed

  // Port 9 is the discard port — refused immediately, so the real per-entry
  // webhook POST fails fast and deterministically.
  const captured: string[] = []
  const original = { log: console.log, warn: console.warn, error: console.error }
  console.log = (...a: unknown[]) => { captured.push(a.join(' ')) }
  console.warn = (...a: unknown[]) => { captured.push(a.join(' ')) }
  console.error = (...a: unknown[]) => { captured.push(a.join(' ')) }
  try {
    teamsQueue.enqueue(
      'test_message' as any,
      {} as any,
      { type: 'AdaptiveCard', version: '1.0', body: [] } as any,
      '',
      '',
      null,
      'https://127.0.0.1:9/SECRET_CHANNEL_PATH',
      1,
    )
    await waitForQueueDrain(() => teamsQueue.getQueueDepth())
  } finally {
    console.log = original.log
    console.warn = original.warn
    console.error = original.error
  }

  assert.equal(teamsQueue.getQueueDepth(), 0, 'the failed entry must be removed — retry budget must terminate')
  assert.ok(
    teamsQueue.getQueueStats().totalFailed > beforeFailed,
    'the per-entry webhook was actually attempted (and permanently failed) — proving the entry URL is used',
  )
  for (const line of captured) {
    assert.ok(!line.includes('SECRET_CHANNEL_PATH'), `a log line leaked the destination webhook URL: ${line}`)
  }
})

test('queue source: a resolved entry is authoritative; loadTeamsConfig is never consulted at send time', () => {
  assert.doesNotMatch(QUEUE_SRC, /loadTeamsConfig/, 'the queue must not re-resolve the destination via teams-webhook-client')
  assert.match(QUEUE_SRC, /entry\.webhookUrl/)
  // The ONLY env fallback allowed is the legacy (unresolved) path.
  assert.match(QUEUE_SRC, /entry\.destinationResolved \? undefined : process\.env\.TEAMS_WEBHOOK_URL/)
})

// ─── Service: resolves per project and passes the destination to the queue ──

test('teams.service resolves the project channel before enqueueing and passes an authoritative destination to the queue', () => {
  assert.match(SERVICE_SRC, /resolveTeamsChannelForProject\(\{\s*projectId: payload\.projectId\s*\}\)/)
  assert.match(SERVICE_SRC, /resolved\.webhookUrl/)
  assert.match(SERVICE_SRC, /resolved\.projectId/)
  // Still a single fire-and-forget entry point dispatching through the queue.
  assert.match(SERVICE_SRC, /enqueue\(/)
  // The destination handed to the queue is marked resolved (see above), so an
  // opted-out project can never be re-routed to the global webhook.
  assert.match(SERVICE_SRC, /resolved\.projectId,[\s\S]{0,200}true,/)
})

test('teams.service logs the routing source/project only, never the resolved webhook URL', () => {
  // Forward-looking proximity check: no console call may precede a use of the
  // resolved secret. (The service logs `resolved.source` / `resolved.projectId`.)
  assert.doesNotMatch(SERVICE_SRC, /console[\s\S]{0,120}resolved\.webhookUrl/)
  assert.match(SERVICE_SRC, /route: ' \+ resolved\.source/)
})

// ─── Dispatcher: projectId threading ────────────────────────────────────────

test('notification dispatcher threads projectId into the Teams payload and gates on a per-project destination', () => {
  assert.match(DISPATCHER_SRC, /projectId\?: number/)
  assert.match(DISPATCHER_SRC, /projectId: payload\.projectId/)
  assert.match(DISPATCHER_SRC, /hasTeamsDestination\(userPayload\.projectId\)/)
  assert.match(DISPATCHER_SRC, /isTeamsEnabledForProject/)
})

// ─── Admin routes: authz, CRUD, sanitized responses ────────────────────────

const PROJECT_ROUTE_SECTION = ROUTE_SRC.slice(
  ROUTE_SRC.indexOf("router.get('/projects'"),
  ROUTE_SRC.indexOf('export default router'),
)

test('/projects routes exist for list, upsert, remove and test', () => {
  assert.match(ROUTE_SRC, /router\.get\('\/projects'/)
  assert.match(ROUTE_SRC, /router\.put\('\/projects\/:projectId\/channel'/)
  assert.match(ROUTE_SRC, /router\.delete\('\/projects\/:projectId\/channel'/)
  assert.match(ROUTE_SRC, /router\.post\('\/projects\/:projectId\/test'/)
})

test('unauthorized configuration attempt: every project channel route requires auth AND admin role', () => {
  const defs = [...ROUTE_SRC.matchAll(/router\.(get|put|post|delete)\('(\/projects[^']*)',([^\n]+)/g)]
  assert.ok(defs.length >= 4, 'expected the four project channel routes')
  for (const [, , path, middleware] of defs) {
    assert.match(middleware, /requireAuth/, `route ${path} must require authentication`)
    assert.match(middleware, /requireAdminOnly/, `route ${path} must be restricted to admins`)
  }
})

test('non-admins receive an explicit 403 ADMIN_REQUIRED (no silent fallthrough)', () => {
  assert.match(ROUTE_SRC, /function requireAdminOnly/)
  assert.match(ROUTE_SRC, /role !== 'admin'/)
  assert.match(ROUTE_SRC, /status\(403\)\.json\(\{ error: 'Access denied', code: 'ADMIN_REQUIRED' \}\)/)
})

test('creating a channel without a link is rejected; an invalid link is rejected with a useful code', () => {
  assert.match(PROJECT_ROUTE_SECTION, /TEAMS_CHANNEL_LINK_REQUIRED/)
  assert.match(PROJECT_ROUTE_SECTION, /validateTeamsWebhookUrl/)
  assert.match(PROJECT_ROUTE_SECTION, /INVALID_TEAMS_CHANNEL_LINK/)
})

test('editing a channel keeps the stored link when no new link is supplied, and supports enable/disable', () => {
  // Edit without a link → the existing (never-displayed) link is preserved.
  assert.match(PROJECT_ROUTE_SECTION, /let nextUrl = existing\?\.webhookUrl/)
  // A supplied link replaces it (after validation).
  assert.match(PROJECT_ROUTE_SECTION, /nextUrl = \(body\.webhookUrl as string\)\.trim\(\)/)
  // enabled is honored (default true on create).
  assert.match(PROJECT_ROUTE_SECTION, /const wantsEnabled = body\.enabled === undefined \? true : body\.enabled === true/)
  assert.match(PROJECT_ROUTE_SECTION, /enabled: wantsEnabled/)
})

test('missing channel configuration yields a useful 400 on the per-project test route', () => {
  assert.match(PROJECT_ROUTE_SECTION, /TEAMS_CHANNEL_NOT_CONFIGURED/)
  assert.match(PROJECT_ROUTE_SECTION, /No Microsoft Teams channel is configured for this project/)
  assert.match(PROJECT_ROUTE_SECTION, /status\(400\)/)
})

test('the test route delivers to the resolved PROJECT channel', () => {
  assert.match(PROJECT_ROUTE_SECTION, /resolveTeamsChannelForProject\(\{ projectId \}\)/)
  assert.match(PROJECT_ROUTE_SECTION, /webhookUrl: resolved\.webhookUrl/)
})

test('project channel responses never include the webhook URL / signature', () => {
  // No row object is ever spread into a response.
  assert.doesNotMatch(PROJECT_ROUTE_SECTION, /\.\.\.saved/)
  assert.doesNotMatch(PROJECT_ROUTE_SECTION, /\.\.\.existing/)
  assert.doesNotMatch(PROJECT_ROUTE_SECTION, /\.\.\.row/)
  // The list route maps explicit safe fields only.
  assert.doesNotMatch(PROJECT_ROUTE_SECTION, /res\.json\(\{[^}]*webhookUrl/s)
  // And no raw response body is echoed for the project test route.
  assert.doesNotMatch(PROJECT_ROUTE_SECTION, /responseBody/)
})

test('every project channel log line goes through the safe logger (no raw console output, no URL argument)', () => {
  assert.match(ROUTE_SRC, /function logChannelError/)
  assert.doesNotMatch(PROJECT_ROUTE_SECTION, /console\.(log|warn|error)/, 'project channel routes must log via logChannelError only')
  assert.match(PROJECT_ROUTE_SECTION, /logChannelError\(/)
  assert.doesNotMatch(ROUTE_SRC, /logChannelError\([^)]*webhookUrl/, 'logChannelError must never be handed the webhook URL')
})

// ─── Repository + schema + migration ───────────────────────────────────────

test('repository upserts on the unique projectId and supports edit / remove', () => {
  assert.match(REPO_SRC, /onConflictDoUpdate\(\{\s*target: projectTeamsChannel\.projectId/)
  assert.match(REPO_SRC, /export async function upsert/)
  assert.match(REPO_SRC, /export async function remove/)
  assert.match(REPO_SRC, /export async function setEnabled/)
  assert.match(REPO_SRC, /export async function listWithProjects/)
})

test('repository never logs the webhook URL', () => {
  assert.doesNotMatch(REPO_SRC, /console\.(log|warn|error)\([^)]*webhookUrl/)
})

test('project_teams_channel table is defined in the backend and frontend schemas', () => {
  for (const src of [BACKEND_SCHEMA_SRC, readFileSync(join(FRONTEND_ROOT, 'lib', 'db', 'schema.ts'), 'utf8')]) {
    assert.match(src, /pgTable\('project_teams_channel'/)
    assert.match(src, /webhookUrl: text\('webhookUrl'\)\.notNull\(\)/)
    assert.match(src, /enabled: boolean\('enabled'\)\.notNull\(\)\.default\(true\)/)
  }
})

test('a migration creates the project_teams_channel table', () => {
  const migrationPath = join(FRONTEND_ROOT, 'lib', 'db', 'migrations', '0030_add_project_teams_channel.sql')
  assert.ok(existsSync(migrationPath), 'migration 0030 must exist')
  const sql = readFileSync(migrationPath, 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "project_teams_channel"/)
  assert.match(sql, /"webhookUrl" text NOT NULL/)
  assert.match(sql, /"projectId" integer NOT NULL UNIQUE/)
})

// ─── Frontend contract: secrets never reach the browser ─────────────────────

test('frontend: the admin UI can add/edit/remove a project channel but never renders the stored link', () => {
  const component = readFileSync(
    join(FRONTEND_ROOT, 'app', 'dashboard', 'admin', 'teams', 'project-channels-client.tsx'),
    'utf8',
  )
  assert.match(component, /Add Teams Channel/)
  assert.match(component, /Edit Link/)
  assert.match(component, /Remove/)
  assert.match(component, /saveTeamsProjectChannel/)
  assert.match(component, /removeTeamsProjectChannel/)
  // The stored secret must never be bound to the DOM/input value.
  assert.doesNotMatch(component, /project\.webhookUrl/)
  assert.doesNotMatch(component, /value=\{[^}]*webhookUrl/)
})

test('frontend: the Microsoft Teams page is titled "Microsoft Teams" and renders the project channel manager', () => {
  const page = readFileSync(join(FRONTEND_ROOT, 'app', 'dashboard', 'admin', 'teams', 'page.tsx'), 'utf8')
  assert.match(page, /title="Microsoft Teams"/)
  assert.match(page, /ProjectChannelsClient/)
  assert.match(page, /getTeamsProjectChannels/)
})

test('frontend actions route project-channel calls through the authenticated bridge', () => {
  const actions = readFileSync(join(FRONTEND_ROOT, 'app', 'actions', 'teams.ts'), 'utf8')
  for (const name of ['saveTeamsProjectChannel', 'removeTeamsProjectChannel', 'sendTeamsProjectTestMessage']) {
    const start = actions.indexOf(`export const ${name}`)
    assert.notEqual(start, -1, `${name} must exist`)
    const body = actions.slice(start, start + 1400)
    assert.match(body, /fetchFromBackendSafe/, `${name} must use the cookie-forwarding bridge`)
  }
})

// ─── Webhook client contract unchanged (config-driven transport) ────────────

test('the webhook transport still sends to the config it is GIVEN (per-project config is honored)', () => {
  assert.match(WEBHOOK_CLIENT_SRC, /export async function sendWebhookMessage\(/)
  assert.match(WEBHOOK_CLIENT_SRC, /config\.webhookUrl/)
  assert.doesNotMatch(WEBHOOK_CLIENT_SRC, /process\.env\.TEAMS_WEBHOOK_URL[\s\S]{0,80}httpsPost/)
})

// ─── Resolver source: safe logging ─────────────────────────────────────────

test('resolver behavior: an invalid project channel is logged WITHOUT leaking the host or signature', () => {
  const captured: string[] = []
  const original = console.error
  console.error = (...a: unknown[]) => { captured.push(a.join(' ')) }
  try {
    const resolved = resolveTeamsChannelFromInputs({
      projectId: 9,
      projectChannel: { webhookUrl: 'https://evil.example.com/steal?sig=LEAK_ME', enabled: true },
      globalWebhookUrl: GLOBAL,
    })
    assert.equal(resolved.source, 'global', 'an invalid project channel must fall back to global')
  } finally {
    console.error = original
  }
  assert.ok(captured.length > 0, 'the invalid channel must be reported to the operator')
  for (const line of captured) {
    assert.ok(!line.includes('LEAK_ME'), `signature leaked into a log line: ${line}`)
    assert.ok(!line.includes('evil.example.com'), `host leaked into a log line: ${line}`)
  }
  assert.match(RESOLVER_SRC, /'invalid_project_channel'/)
  assert.match(RESOLVER_SRC, /reason: 'project_channel_disabled'/)
  assert.match(VALIDATOR_SRC, /export function validateTeamsWebhookUrl/)
})
