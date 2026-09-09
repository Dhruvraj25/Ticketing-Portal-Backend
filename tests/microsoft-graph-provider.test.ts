import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Microsoft Graph email provider — delivery diagnostic regression
// ============================================================================
// The provider constructs its ClientSecretCredential / Graph Client at
// MODULE LOAD TIME from process.env.MICROSOFT_*! — importing it directly
// under node:test without those vars populated (this test runner does not
// load .env) would crash at import. So, matching this repo's established
// convention for config-shaped concerns (see tests/frontend-url.test.ts's
// sibling suites), these are source-level regression guards proving the
// ACTUAL current file content — verified end-to-end separately via
// scripts/diagnose-graph-email.ts against real Azure credentials (see the
// task report: token acquired, aud=https://graph.microsoft.com, Mail.Send
// present in the app-only token's roles claim, and a real sendMail POST to
// the configured sender's own mailbox resolved without throwing).

const SRC = readFileSync(
  join(import.meta.dirname, '..', 'src', 'services', 'email', 'providers', 'microsoft-graph.provider.ts'),
  'utf8',
)

test('sendMicrosoftGraphEmail wraps the Graph call in try/catch and RE-THROWS on failure (never swallowed)', () => {
  const tryIdx = SRC.indexOf('try {')
  const catchIdx = SRC.indexOf('} catch (error) {')
  assert.ok(tryIdx !== -1 && catchIdx !== -1 && tryIdx < catchIdx, 'the Graph POST must be wrapped in try/catch')
  const catchBlock = SRC.slice(catchIdx, SRC.indexOf('\nexport const microsoftGraphProvider'))
  assert.match(catchBlock, /throw error/, 'a failed Graph send must propagate as a rejected promise, never be swallowed into a false success')
})

test('a Graph send failure is logged with the REAL status/code/message, never a generic string', () => {
  const catchIdx = SRC.indexOf('} catch (error) {')
  const catchBlock = SRC.slice(catchIdx, SRC.indexOf('\nexport const microsoftGraphProvider'))
  assert.match(catchBlock, /err\?\.statusCode/)
  assert.match(catchBlock, /err\?\.code/)
  assert.match(catchBlock, /err\?\.message/)
})

test('the returned messageId is explicitly documented as NOT a real Graph message ID (sendMail returns no body)', () => {
  assert.match(SRC, /messageId: "graph-accepted-no-id-returned"/)
  assert.doesNotMatch(SRC, /messageId: "graph-api-sent"/, 'the old, misleadingly-named placeholder must be gone')
  // The comment explaining WHY must be present, so this can never regress
  // back into being read as a genuine identifier.
  assert.match(SRC, /no real Graph message ID to capture/)
})

test('a successful send is logged distinctly from mailbox delivery — "accepted", never "delivered"', () => {
  const successLogMatch = SRC.match(/console\.log\(\s*`\[Email\]\[Microsoft Graph\] Accepted by Graph[^`]*`/)
  assert.ok(successLogMatch, 'success path must log that Graph ACCEPTED the request')
  assert.doesNotMatch(SRC, /console\.log\([^)]*mailbox received|console\.log\([^)]*delivered successfully(?!.*webhook)/i)
})

test('verifyConnection() never logs the token, client secret, or tenant/client IDs — only a boolean and a sanitized error message', () => {
  const fnStart = SRC.indexOf('async verifyConnection()')
  const fnEnd = SRC.lastIndexOf('}')
  const fn = SRC.slice(fnStart, fnEnd)
  assert.doesNotMatch(fn, /token\.token/, 'must never log the raw token value')
  assert.doesNotMatch(fn, /clientSecret/, 'must never reference the raw secret inside this function')
  assert.match(fn, /return !!token\?\.token/, 'reports only a boolean — token acquired or not')
})

test('MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET/SENDER_EMAIL are read from env, never hardcoded', () => {
  assert.match(SRC, /process\.env\.MICROSOFT_TENANT_ID/)
  assert.match(SRC, /process\.env\.MICROSOFT_CLIENT_ID/)
  assert.match(SRC, /process\.env\.MICROSOFT_CLIENT_SECRET/)
  assert.match(SRC, /process\.env\.MICROSOFT_SENDER_EMAIL/)
})

test('the Graph client authenticates via ClientSecretCredential with the exact Graph .default scope', () => {
  assert.match(SRC, /new ClientSecretCredential\(\s*tenantId,\s*clientId,\s*clientSecret\s*\)/)
  assert.match(SRC, /"https:\/\/graph\.microsoft\.com\/\.default"/)
})

test('the actual send targets POST /users/{senderEmail}/sendMail with subject/body/toRecipients', () => {
  assert.match(SRC, /\.api\(`\/users\/\$\{senderEmail\}\/sendMail`\)/)
  assert.match(SRC, /\.post\(\{/)
  assert.match(SRC, /subject: params\.subject/)
  assert.match(SRC, /toRecipients: recipients\.map/)
})

test('EMAIL_PROVIDER stays microsoft-graph — provider name is not renamed away from the canonical value', () => {
  assert.match(SRC, /name: "microsoft-graph"/)
})
