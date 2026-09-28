import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================================
// Admin → Email Management — safety & behavior regression suite
// ============================================================================

const SRC = (p: string) => readFileSync(join(import.meta.dirname, '..', 'src', p), 'utf8')
const ROUTES = SRC('routes/email-admin.ts')
const SENDER = SRC('services/email/email-sender-config.ts')
const QUEUE = SRC('services/email/email.queue.ts')
const GRAPH = SRC('services/email/providers/microsoft-graph.provider.ts')

// ─── Authorization ──────────────────────────────────────────────────────────

test('every /api/email-admin route requires an authenticated ADMIN (router-level guard)', () => {
  // Handlers live on an inner router that is ONLY mounted behind authenticate → requireAdminOnly.
  assert.match(ROUTES, /router\.use\(authenticate, requireAdminOnly as unknown as RequestHandler, routes\)/)
  assert.match(ROUTES, /authenticate: RequestHandler = requireAuth as unknown as RequestHandler/)
  assert.match(ROUTES, /export default createEmailAdminRouter\(\)/)
  assert.match(ROUTES, /if \(req\.user\?\.role !== 'admin'\) \{\s*return res\.status\(403\)/)
  // The guard is registered before any route handler.
  assert.doesNotMatch(ROUTES, /export default routes/, 'the unguarded handler router is never exported')
})

// ─── Secrets never leave the server ─────────────────────────────────────────

test('admin routes never reference credentials, tokens or stored email bodies', () => {
  assert.doesNotMatch(ROUTES, /MICROSOFT_CLIENT_SECRET|clientSecret|getToken|access_token|DATABASE_URL/)
  assert.doesNotMatch(ROUTES, /htmlContent/, 'logged email bodies are never returned')
})

test('email bodies are never written to email_log (they can contain credentials/reset links)', () => {
  assert.doesNotMatch(QUEUE, /htmlContent|html_content/)
})

// ─── Sender: one authoritative source, verified before activation ───────────

test('resolveSender: DB sender is used ONLY when verified; otherwise MICROSOFT_SENDER_EMAIL', () => {
  assert.match(SENDER, /row\?\.senderStatus === 'verified' && row\.senderEmail/)
  assert.match(SENDER, /process\.env\.MICROSOFT_SENDER_EMAIL/)
})

test('Graph provider sends as the resolved sender (not a value cached at client build time)', () => {
  assert.match(GRAPH, /options\?\.sender \?\? \(await resolveSender\(\)\)/)
  assert.doesNotMatch(GRAPH, /senderEmail = config\.senderEmail/)
})

test('PUT /sender activates a sender only after Microsoft Graph verification succeeds', () => {
  const start = ROUTES.indexOf("routes.put('/sender'")
  const body = ROUTES.slice(start, ROUTES.indexOf("routes.post('/test-email'"))
  const verifyIdx = body.indexOf('await verifyGraphSender(')
  const failIdx = body.indexOf('if (!verification.ok) {')
  const activateIdx = body.indexOf("senderStatus: 'verified'")
  assert.ok(verifyIdx !== -1 && failIdx > verifyIdx && activateIdx > failIdx, 'verify → reject-on-failure → only then activate')
  // The failure branch records the attempt but never writes senderEmail/senderStatus.
  const failBranch = body.slice(failIdx, body.indexOf('reason: verification.error', failIdx))
  // (lastVerificationEmail: senderEmail is fine — it records the failed attempt.)
  assert.doesNotMatch(failBranch, /senderStatus|\n\s+senderEmail,/)
  assert.match(failBranch, /Unable to verify this sender email with Microsoft Graph\./)
  assert.match(failBranch, /status\(422\)/)
})

// ─── Logging is fail-open ───────────────────────────────────────────────────

test('queue logging never blocks sending: skipped without a DB and every failure is caught', () => {
  assert.match(QUEUE, /if \(!process\.env\.DATABASE_URL\) return Promise\.resolve\(null\)/)
  assert.match(QUEUE, /email_log insert skipped/)
  assert.match(QUEUE, /email_log update skipped/)
})

// ─── Template previews use the real senders and never send ──────────────────

test('every catalog template renders a preview via the real sender without enqueueing mail', async () => {
  delete process.env.DATABASE_URL
  const { EMAIL_TEMPLATE_CATALOG, renderTemplatePreview } = await import('../src/services/email/email-template-catalog')
  const { getQueueDepth } = await import('../src/services/email/email.queue')
  const before = getQueueDepth()
  for (const entry of EMAIL_TEMPLATE_CATALOG) {
    const preview = renderTemplatePreview(entry.eventType)
    assert.ok(preview, `${entry.eventType} must render`)
    assert.ok(preview!.subject.length > 0, `${entry.eventType} must have a subject`)
    assert.ok(preview!.variables.length > 0, `${entry.eventType} must list its variables`)
    assert.doesNotMatch(preview!.subject + preview!.html, /undefined|\[object Object\]/, `${entry.eventType} preview must not leak undefined`)
  }
  assert.equal(getQueueDepth(), before, 'previews must never enqueue an email')
  assert.equal(renderTemplatePreview('does_not_exist'), null)
})

test('email_log updates for one email are chained (applied in order), never fired in parallel', () => {
  // Regression: independent fire-and-forget updates raced — a late "sending"
  // write could overwrite "sent", and a late "pending" could overwrite "failed".
  assert.match(QUEUE, /handle\.chain = handle\.chain\.then\(async \(id\) => \{/)
})