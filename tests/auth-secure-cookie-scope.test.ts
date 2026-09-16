import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Regression guard — local Teams/auth connectivity audit
// ============================================================================
// Root cause: AUTH_USE_SECURE_COOKIES (src/config/auth.ts) and its diagnostic
// mirror in src/middleware/auth.ts used to OR in `process.env.NODE_ENV ===
// 'production'` alongside the frontend-scheme check. A stray
// NODE_ENV=production in a local .env (left over from an unrelated
// performance-audit session) forced the backend to demand the
// "__Secure-"-prefixed session cookie even though FRONTEND_URL correctly
// resolved to http://localhost:3000 — so every authenticated request
// (including every Teams project-channel call) 401'd with
// COOKIE_NOT_FOUND, despite CORS being fine and the cookie being correctly
// forwarded from the frontend. The frontend's URL SCHEME is the only fact
// that should ever decide the cookie name; NODE_ENV must never override it
// (Railway/production naturally has an https FRONTEND_URL, so the
// scheme-only check still resolves correctly there without any NODE_ENV
// involvement).
// ============================================================================

const AUTH_CONFIG_SRC = readFileSync(join(import.meta.dirname, '..', 'src', 'config', 'auth.ts'), 'utf8')
const AUTH_MIDDLEWARE_SRC = readFileSync(join(import.meta.dirname, '..', 'src', 'middleware', 'auth.ts'), 'utf8')

test('AUTH_USE_SECURE_COOKIES (src/config/auth.ts) is decided ONLY by the frontend URL scheme — never by NODE_ENV', () => {
  assert.match(
    AUTH_CONFIG_SRC,
    /const AUTH_USE_SECURE_COOKIES = AUTH_FRONTEND_URL\.startsWith\('https:\/\/'\)\s*$/m,
    'must be a plain scheme check with no additional OR condition',
  )
  assert.doesNotMatch(
    AUTH_CONFIG_SRC,
    /AUTH_USE_SECURE_COOKIES\s*=[\s\S]{0,200}NODE_ENV/,
    'NODE_ENV must never factor into the session cookie name decision',
  )
})

test('the diagnostic useSecureCookies mirror (src/middleware/auth.ts) matches — scheme only, never NODE_ENV', () => {
  assert.match(
    AUTH_MIDDLEWARE_SRC,
    /const useSecureCookies = frontendUrl\.startsWith\('https:\/\/'\)\s*$/m,
    'must be a plain scheme check with no additional OR condition',
  )
  assert.doesNotMatch(
    AUTH_MIDDLEWARE_SRC,
    /useSecureCookies\s*=[\s\S]{0,200}NODE_ENV/,
    'NODE_ENV must never factor into the diagnostic cookie-name expectation',
  )
})
