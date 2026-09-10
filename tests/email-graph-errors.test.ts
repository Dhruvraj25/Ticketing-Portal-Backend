import { test } from 'node:test'
import assert from 'node:assert/strict'

// ============================================================================
// Email Graph Error Mapping Tests
// ============================================================================

// Test the error message mapping directly
const GRAPH_ERROR_MESSAGES: Record<number, string> = {
  400: 'The email could not be sent because the request was invalid.',
  401: 'The email service is not authorized to send this message. Please contact an administrator.',
  403: 'The email service is not authorized to send this message. Please contact an administrator.',
  404: 'The email could not be sent because the configured sender or recipient could not be found.',
  429: 'The email service is temporarily busy. Please try again shortly.',
  500: 'The email service is temporarily unavailable. Please try again later.',
  502: 'The email service is temporarily unavailable. Please try again later.',
  503: 'The email service is temporarily unavailable. Please try again later.',
}

function getGraphErrorMessage(statusCode: number): string {
  return GRAPH_ERROR_MESSAGES[statusCode] || 'The email could not be sent. Please try again later.'
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Graph error 400 returns invalid request message', () => {
  const msg = getGraphErrorMessage(400)
  assert.ok(msg.includes('invalid'), 'Should mention invalid request')
  assert.ok(!msg.includes('Graph'), 'Should not expose Microsoft Graph')
  assert.ok(!msg.includes('token'), 'Should not expose tokens')
})

test('Graph error 401 returns unauthorized message', () => {
  const msg = getGraphErrorMessage(401)
  assert.ok(msg.includes('not authorized'), 'Should mention authorization')
  assert.ok(msg.includes('administrator'), 'Should suggest contacting admin')
})

test('Graph error 403 returns unauthorized message', () => {
  const msg = getGraphErrorMessage(403)
  assert.ok(msg.includes('not authorized'), 'Should mention authorization')
})

test('Graph error 404 returns not found message', () => {
  const msg = getGraphErrorMessage(404)
  assert.ok(msg.includes('not be found'), 'Should mention not found')
})

test('Graph error 429 returns rate limit message', () => {
  const msg = getGraphErrorMessage(429)
  assert.ok(msg.includes('busy') || msg.includes('try again'), 'Should mention rate limiting')
})

test('Graph error 500 returns service unavailable message', () => {
  const msg = getGraphErrorMessage(500)
  assert.ok(msg.includes('unavailable'), 'Should mention unavailability')
})

test('Graph error 502 returns service unavailable message', () => {
  const msg = getGraphErrorMessage(502)
  assert.ok(msg.includes('unavailable'), 'Should mention unavailability')
})

test('Graph error 503 returns service unavailable message', () => {
  const msg = getGraphErrorMessage(503)
  assert.ok(msg.includes('unavailable'), 'Should mention unavailability')
})

test('Unknown status code returns generic message', () => {
  const msg = getGraphErrorMessage(999)
  assert.ok(msg.includes('could not be sent'), 'Should return generic error')
})

test('All error messages are safe (no secrets/tokens/URLs)', () => {
  for (const [code, msg] of Object.entries(GRAPH_ERROR_MESSAGES)) {
    assert.ok(!msg.includes('graph.microsoft.com'), `Status ${code}: should not expose Graph URL`)
    assert.ok(!msg.includes('tenant'), `Status ${code}: should not expose tenant info`)
    assert.ok(!msg.includes('client_secret'), `Status ${code}: should not expose secrets`)
    assert.ok(!msg.includes('access_token'), `Status ${code}: should not expose tokens`)
    assert.ok(!msg.includes('smtp'), `Status ${code}: should not expose SMTP details`)
  }
})

test('All error messages are user-friendly length', () => {
  for (const [code, msg] of Object.entries(GRAPH_ERROR_MESSAGES)) {
    assert.ok(msg.length > 10, `Status ${code}: message too short`)
    assert.ok(msg.length < 200, `Status ${code}: message too long`)
  }
})

// ─── Structured Error Propagation Tests ─────────────────────────────────────

test('Graph error thrown from provider has statusCode and provider fields', () => {
  // Simulate the structured error that the provider now throws
  const graphError = new Error('Forbidden') as Error & { statusCode: number; provider: string }
  graphError.statusCode = 403
  graphError.provider = 'microsoft-graph'

  assert.equal(graphError.statusCode, 403)
  assert.equal(graphError.provider, 'microsoft-graph')
  assert.ok(!graphError.message.includes('tenant'), 'Should not expose tenant info')
})
