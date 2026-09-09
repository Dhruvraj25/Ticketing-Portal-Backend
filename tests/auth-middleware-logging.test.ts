import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// requireAuth — safe diagnostic logging on the ACTUAL first-failure point
// ============================================================================
// First escalation: every /api/teams/* route is gated by requireAuth, which
// validates the session via auth.api.getSession({ headers: req.headers }) —
// Better Auth reads the session token from the request's Cookie header.
// Confirmed directly against a real running local backend:
//   curl http://localhost:4000/api/teams/status              → 401 (no cookie)
//   curl .../status -H "Cookie: session=garbage"              → 401 (invalid
//     session — logged as hasCookie=true, distinguishing it from the
//     no-cookie-at-all case above)
//
// Second escalation (this one): after the cookie-forwarding fix, production
// still 401'd on every request even though Railway logs confirmed requests
// were arriving with the correct /api/teams/* path. Traced to a Better Auth
// SIGNED session cookie: confirmed directly in the installed library
// (node_modules/better-auth/dist/cookies/index.mjs:172) —
//   ctx.setSignedCookie(authCookies.sessionToken.name, session.session.token,
//     ctx.context.secret, ...)
// — the session cookie is HMAC-signed with BETTER_AUTH_SECRET. Verified via
// SHA-256 hash comparison of the actual configured values (never printed):
// Frontend's and Backend's BETTER_AUTH_SECRET differ (different hash,
// different length), while DATABASE_URL points at the identical host/db/user
// on both sides. A cookie signed by Vercel's secret fails signature
// verification on Railway regardless of the (correctly shared) database —
// this alone explains every 401 independent of cookie forwarding. requireAuth
// now logs BEFORE the session check too, so a production log always shows
// whether a request even arrived with cookies, independent of whether
// verification then succeeds.

const SRC = readFileSync(
  join(import.meta.dirname, '..', 'src', 'middleware', 'auth.ts'),
  'utf8',
)

test('requireAuth logs a session_check line on every request, with cookie names/counts, origin and host — never a cookie value', () => {
  assert.match(SRC, /console\.log\(\s*`\[Auth\] session_check path=\$\{req\.path\} hasCookie=\$\{cookieNames\.length > 0\} `/)
  assert.match(SRC, /cookieNames=\[\$\{cookieNames\.join\(','\)\}\]/)
  assert.match(SRC, /origin=\$\{req\.headers\.origin/)
  assert.match(SRC, /host=\$\{req\.headers\.host/)
})

test('extractCookieNames only ever returns cookie NAMES (the part before "="), never values', () => {
  assert.match(SRC, /function extractCookieNames\(cookieHeader: string \| undefined\): string\[\]/)
  assert.match(SRC, /pair\.split\('='\)\[0\]\?\.trim\(\)/)
})

test('requireAuth logs a safe, structured warning when the session is missing — never the cookie/token value', () => {
  assert.match(SRC, /console\.warn\(`\[Auth\] session_invalid path=\$\{req\.path\} hasCookie=\$\{cookieNames\.length > 0\} cookieNames=\[\$\{cookieNames\.join\(','\)\}\]`\)/)
})

test('requireAuth logs a safe warning when session lookup itself throws — sanitized error message only', () => {
  assert.match(SRC, /console\.warn\(`\[Auth\] session_lookup_failed path=\$\{req\.path\} error=\$\{err instanceof Error \? err\.message : 'unknown'\}`\)/)
})

test('requireAuth still returns a plain 401 JSON body in both failure paths — behavior unchanged, only logging added', () => {
  const matches = [...SRC.matchAll(/res\.status\(401\)\.json\(\{ error: 'Unauthorized' \}\)/g)]
  assert.equal(matches.length, 2, 'both the no-session and the exception paths must still return the same 401 shape')
})

test('requireAuth never logs the resolved session object, cookie header value, user token, or full request headers', () => {
  assert.doesNotMatch(SRC, /console\.(log|warn|error)\([^)]*session\)/i)
  assert.doesNotMatch(SRC, /console\.(log|warn|error)\([^)]*req\.headers\)(?!\.cookie)/i)
  // req.headers.cookie itself must never be interpolated directly — only
  // extractCookieNames(req.headers.cookie)'s NAME-only output may be logged.
  assert.doesNotMatch(SRC, /\$\{req\.headers\.cookie\}/)
})

test('requireAuth is unchanged in its authorization decision — no bypass, no hardcoded token, still delegates entirely to auth.api.getSession', () => {
  assert.match(SRC, /auth\.api\.getSession\(\{ headers: req\.headers as Record<string, string> \}\)/)
  assert.doesNotMatch(SRC, /req\.headers\['?x-admin/i)
  assert.doesNotMatch(SRC, /ADMIN_BYPASS|SKIP_AUTH|DEBUG_AUTH/i)
})
