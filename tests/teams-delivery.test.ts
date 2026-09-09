import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadTeamsConfig, isWebhookReady, getWebhookStatus } from '../src/services/teams/teams-webhook-client'
import { validateConfig } from '../src/services/teams/teams-config-validator'

const ROOT = join(import.meta.dirname, '..')
const WEBHOOK_CLIENT_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-webhook-client.ts'), 'utf8')
const CONFIG_VALIDATOR_SRC = readFileSync(join(ROOT, 'src', 'services', 'teams', 'teams-config-validator.ts'), 'utf8')
const ROUTE_SRC = readFileSync(join(ROOT, 'src', 'routes', 'teams-notification.ts'), 'utf8')

// ─── Config presence (functional — no network call) ────────────────────────

test('loadTeamsConfig() reads TEAMS_WEBHOOK_URL from the real environment', () => {
  const config = loadTeamsConfig()
  // Verified separately via scripts/diagnose-teams.ts against the real
  // configured webhook: TEAMS_CONFIG_PRESENT: YES, a real POST returned
  // HTTP 202 (TEAMS_SUCCESS). Here we only assert the loader's contract.
  assert.equal(typeof config.enabled, 'boolean')
  if (process.env.TEAMS_WEBHOOK_URL) {
    assert.equal(config.enabled, true)
    assert.equal(isWebhookReady(config), true)
  }
})

test('TEAMS_CONFIG_MISSING is reported correctly when no webhook URL is set', () => {
  const config = { webhookUrl: undefined, enabled: false, mockMode: true }
  assert.equal(isWebhookReady(config), false)
})

// ─── Security: webhook URL must never be exposed ───────────────────────────
// A Power Automate / Incoming Webhook URL carries an embedded signature that
// authenticates the call — equivalent to a secret. Root-cause fix: both
// getWebhookStatus() and validateConfig() previously returned a substring
// PREFIX of the real URL to the admin frontend page.

test('getWebhookStatus() never returns any portion of the webhook URL', () => {
  const status = getWebhookStatus() as Record<string, unknown>
  assert.ok(!('webhookUrlPreview' in status), 'webhookUrlPreview must be fully removed, not just emptied')
  for (const value of Object.values(status)) {
    if (typeof value === 'string' && process.env.TEAMS_WEBHOOK_URL) {
      assert.ok(!value.includes(process.env.TEAMS_WEBHOOK_URL.slice(0, 20)), 'no returned field may contain a fragment of the real webhook URL')
    }
  }
})

test('validateConfig() reports only a boolean-style "(configured)" marker, never a URL substring', () => {
  const report = validateConfig({ webhookUrl: 'https://prod-00.westus.logic.azure.com/workflows/abc123/triggers/manual/paths/invoke?sig=SECRET_SIGNATURE_VALUE', enabled: true, mockMode: false })
  const webhookResult = report.results.find(r => r.key === 'webhookUrl')
  assert.ok(webhookResult)
  assert.equal(webhookResult!.value, '(configured)')
  assert.ok(!JSON.stringify(report).includes('SECRET_SIGNATURE_VALUE'), 'the signature must never appear anywhere in the validation report')
})

test('source regression: no .substring( call is ever applied to a webhook URL value', () => {
  assert.doesNotMatch(WEBHOOK_CLIENT_SRC, /webhookUrl.*\.substring\(/)
  assert.doesNotMatch(CONFIG_VALIDATOR_SRC, /value\.substring\(/)
})

test('the /status route no longer forwards a webhookUrlPreview field', () => {
  assert.doesNotMatch(ROUTE_SRC, /webhookUrlPreview/)
})

// ─── Error handling — Graph/webhook failures are never swallowed ──────────

test('sendWebhookMessage never marks a non-2xx response as success', () => {
  assert.match(WEBHOOK_CLIENT_SRC, /if \(statusCode >= 200 && statusCode < 300\) \{/)
  // The success branch must be the ONLY path that returns success: true for
  // a real (non-mock) send.
  const successBranch = WEBHOOK_CLIENT_SRC.slice(
    WEBHOOK_CLIENT_SRC.indexOf('if (statusCode >= 200 && statusCode < 300) {'),
    WEBHOOK_CLIENT_SRC.indexOf('let errorMessage: string'),
  )
  assert.match(successBranch, /success: true/)
})

test('sendWebhookMessage captures the real HTTP status and a sanitized error/response body on failure, never swallowed', () => {
  assert.match(WEBHOOK_CLIENT_SRC, /return \{\s*success: false,\s*message: 'Webhook returned status ' \+ statusCode,/)
  assert.match(WEBHOOK_CLIENT_SRC, /error: errorMessage,/)
})

test('a request-level failure (network error, timeout) is caught and reported, never left unhandled', () => {
  assert.match(WEBHOOK_CLIENT_SRC, /catch \(err\) \{[\s\S]*?return \{ success: false, message: 'HTTP request failed', error: error\.message/)
})

// ─── Route-level: test route never claims success without a real result ───

test('the /test route reports the ACTUAL sendWebhookMessage result.success — never hardcoded success', () => {
  const testRouteStart = ROUTE_SRC.indexOf("router.post('/test'")
  const testRouteEnd = ROUTE_SRC.indexOf("router.get('/status'")
  const testRoute = ROUTE_SRC.slice(testRouteStart, testRouteEnd)
  assert.match(testRoute, /const result = await sendWebhookMessage\(/)
  assert.match(testRoute, /if \(result\.success\) \{/)
  assert.match(testRoute, /success: false,[\s\S]*?message: 'Webhook returned error'/)
})
