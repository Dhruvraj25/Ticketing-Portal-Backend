import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Email notification route — URL normalization coverage
// ============================================================================
// sendEmailNotification() (src/routes/email-notification.ts) rewrites every
// link field's host to the configured FRONTEND_URL before it reaches an email
// template, so a frontend-constructed localhost URL can never leak into a
// sent email. Originally only ticketLink/feedbackLink/walletLink were
// covered — loginUrl/resetLink/adminUrl/projectLink relied solely on the
// Frontend's own getPortalUrl() safety net. This test locks in that ALL
// seven link fields go through the same backend-side rewrite (defense in
// depth), since the route itself isn't easily unit-importable (Express +
// module-load-time getFrontendUrl()).

const ROUTE_SRC = readFileSync(
  join(import.meta.dirname, '..', 'src', 'routes', 'email-notification.ts'),
  'utf8',
)

const NORMALIZED_FIELDS = ['ticketLink', 'feedbackLink', 'walletLink', 'loginUrl', 'resetLink', 'adminUrl', 'projectLink']

test('email-notification route rewrites every link field to the configured FRONTEND_URL', () => {
  for (const field of NORMALIZED_FIELDS) {
    const pattern = new RegExp(
      `if \\(data\\.${field}\\) \\{\\s*\\n\\s*data\\.${field} = data\\.${field}\\.replace\\(/\\^https\\?:\\\\/\\\\/\\[\\^\\\\/\\]\\+/, FRONTEND_URL\\)`,
    )
    assert.match(ROUTE_SRC, pattern, `${field} must be rewritten to FRONTEND_URL before reaching a template`)
  }
})

test('the normalization block runs before the eventType switch (applies to every event)', () => {
  const normalizeIdx = ROUTE_SRC.indexOf('if (data.ticketLink)')
  const switchIdx = ROUTE_SRC.indexOf('switch (eventType)')
  assert.ok(normalizeIdx !== -1 && switchIdx !== -1 && normalizeIdx < switchIdx)
})
