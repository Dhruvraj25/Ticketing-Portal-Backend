import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// requireAuth — safe diagnostic logging on the ACTUAL first-failure point
// ============================================================================
// The root cause of the Teams admin page failures traced this escalation:
// every /api/teams/* route is gated by requireAuth, which validates the
// session via auth.api.getSession({ headers: req.headers }) — Better Auth
// reads the session token from the request's Cookie header. Confirmed
// directly against a real running local backend:
//   curl http://localhost:4000/api/teams/status              → 401 (no cookie)
//   curl .../status -H "Cookie: session=garbage"              → 401 (invalid
//     session — now logged as hasCookie=true, distinguishing it from the
//     no-cookie-at-all case above)
// Before this fix, requireAuth's 401 path was completely silent — this exact
// bug class (a caller never forwarding its session cookie) was invisible in
// production logs. It now logs a safe, structured line — no cookie value, no
// token, no session id.

const SRC = readFileSync(
  join(import.meta.dirname, '..', 'src', 'middleware', 'auth.ts'),
  'utf8',
)

test('requireAuth logs a safe, structured warning when the session is missing — never the cookie/token value', () => {
  assert.match(SRC, /console\.warn\(`\[Auth\] session_invalid path=\$\{req\.path\} hasCookie=\$\{!!req\.headers\.cookie\}`\)/)
  // Must never log the actual cookie string, only its presence (!!).
  assert.doesNotMatch(SRC, /req\.headers\.cookie\}(?!`\))/)
  assert.doesNotMatch(SRC, /console\.(log|warn|error)\([^)]*req\.headers\.cookie(?!\s*[)}])/)
})

test('requireAuth logs a safe warning when session lookup itself throws — sanitized error message only', () => {
  assert.match(SRC, /console\.warn\(`\[Auth\] session_lookup_failed path=\$\{req\.path\} error=\$\{err instanceof Error \? err\.message : 'unknown'\}`\)/)
})

test('requireAuth still returns a plain 401 JSON body in both failure paths — behavior unchanged, only logging added', () => {
  const matches = [...SRC.matchAll(/res\.status\(401\)\.json\(\{ error: 'Unauthorized' \}\)/g)]
  assert.equal(matches.length, 2, 'both the no-session and the exception paths must still return the same 401 shape')
})

test('requireAuth never logs the resolved session object, user token, or full request headers', () => {
  assert.doesNotMatch(SRC, /console\.(log|warn|error)\([^)]*session\)/i)
  assert.doesNotMatch(SRC, /console\.(log|warn|error)\([^)]*req\.headers\)(?!\.cookie)/i)
})
