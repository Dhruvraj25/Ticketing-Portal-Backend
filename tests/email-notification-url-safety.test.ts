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

// Link normalization moved from this route into ONE central place that every
// email passes through (utils/frontend-url.ts → withFrontendLinks, applied by
// every sender in services/email/email.service.ts), so it now also covers
// emails that never touch this route and the portalUrl field. Behaviour is
// verified end-to-end in tests/email-frontend-links.test.ts.
const FRONTEND_URL_SRC = readFileSync(join(import.meta.dirname, '..', 'src', 'utils', 'frontend-url.ts'), 'utf8')
const SERVICE_SRC = readFileSync(join(import.meta.dirname, '..', 'src', 'services', 'email', 'email.service.ts'), 'utf8')

test('every link field is re-based onto the configured FRONTEND_URL (central APP_LINK_FIELDS)', () => {
  for (const field of [...NORMALIZED_FIELDS, 'portalUrl']) {
    assert.match(FRONTEND_URL_SRC, new RegExp(`'${field}',`), `${field} must be re-based onto FRONTEND_URL before reaching a template`)
  }
  assert.doesNotMatch(FRONTEND_URL_SRC, /'companyLogoUrl'/, 'external URLs (logo) are never rewritten')
})

test('every email sender re-bases links BEFORE rendering its template (applies to every event)', () => {
  const senders = [...SERVICE_SRC.matchAll(/export function (send\w+)\([\s\S]*?\n\}/g)]
  assert.ok(senders.length >= 31)
  for (const [body, name] of senders) {
    const linkIdx = body.indexOf('data = frontendLinks(data)')
    const renderIdx = body.search(/const html = \w+Template\(data/)
    assert.ok(linkIdx !== -1 && renderIdx !== -1 && linkIdx < renderIdx, `${name} must re-base links before rendering`)
  }
})
