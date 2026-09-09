import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// [AuthConfig] startup logging — verifiable runtime secret comparison
// ============================================================================
// Third escalation: the user changed Railway's BETTER_AUTH_SECRET to match
// Vercel's, but had no way to confirm the RUNNING process actually picked up
// the new value (env var changes require a restart; a stale process would
// keep 401ing with no visible sign why). This logs a SHA-256 hash PREFIX (12
// hex chars, not reversible) + length at startup on BOTH services, so they
// can be compared directly in each service's own production logs — Railway's
// for the backend (Backend/src/server.ts), Vercel's Runtime Logs for the
// frontend (Frontend/lib/auth.ts, verified in its own Frontend test suite).

const SRC = readFileSync(join(import.meta.dirname, '..', 'src', 'server.ts'), 'utf8')

test('logAuthConfig() logs secretConfigured/secretLength/secretHashPrefix, never the secret itself', () => {
  assert.match(SRC, /function logAuthConfig\(\)/)
  assert.match(SRC, /const secret = process\.env\.BETTER_AUTH_SECRET/)
  assert.match(SRC, /console\.log\('\[AuthConfig\] secretConfigured=false'\)/)
  assert.match(SRC, /secretHashPrefix=\$\{hashPrefix\}/)
  // Must derive the prefix via a one-way hash, never log `secret` directly.
  assert.match(SRC, /createHash\('sha256'\)\.update\(secret\)\.digest\('hex'\)\.slice\(0, 12\)/)
  assert.doesNotMatch(SRC, /console\.log\([^)]*\$\{secret\}/, 'must never interpolate the raw secret into a log line')
})

test('logAuthConfig() runs at server startup, before email/teams initialization', () => {
  const startIdx = SRC.indexOf('async function startServer()')
  const bodyEnd = SRC.indexOf('// ─── Initialize Email System')
  const body = SRC.slice(startIdx, bodyEnd)
  assert.match(body, /logAuthConfig\(\)/)
})

test('the hash prefix is exactly 12 hex characters — long enough to distinguish secrets, short enough to never be brute-forced back to the original', () => {
  assert.match(SRC, /\.slice\(0, 12\)/)
})
