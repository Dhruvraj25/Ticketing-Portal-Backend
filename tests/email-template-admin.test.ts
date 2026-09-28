import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'

// ============================================================================
// Admin → Email Management → Edit Email Template
// ============================================================================
// HTTP-level authorization/validation tests run the REAL router behind a fake
// session (createEmailAdminRouter's authenticate hook); send-path tests use the
// REAL email.service → queue with a stand-in provider. No database is used:
// DATABASE_URL is cleared so nothing can reach a real database.
// ============================================================================

delete process.env.DATABASE_URL

// Loaded in before() (CommonJS test build: no top-level await), AFTER the
// DATABASE_URL guard above.
let express: typeof import('express')
let createEmailAdminRouter: typeof import('../src/routes/email-admin').createEmailAdminRouter
let overrides: typeof import('../src/services/email/email-template-overrides')
let catalog: typeof import('../src/services/email/email-template-catalog')
let svc: typeof import('../src/services/email/email.service')
let queue: typeof import('../src/services/email/email.queue')
let providers: typeof import('../src/services/email/email.provider')

before(async () => {
  express = (await import('express')).default as unknown as typeof import('express')
  ;({ createEmailAdminRouter } = await import('../src/routes/email-admin'))
  overrides = await import('../src/services/email/email-template-overrides')
  catalog = await import('../src/services/email/email-template-catalog')
  svc = await import('../src/services/email/email.service')
  queue = await import('../src/services/email/email.queue')
  providers = await import('../src/services/email/email.provider')
})

// ─── HTTP harness ───────────────────────────────────────────────────────────

function fakeAuth(role: string | null) {
  return (req: any, res: any, next: any) => {
    if (!role) return res.status(401).json({ error: 'Unauthorized' })
    req.user = { id: `test-${role}`, role }
    next()
  }
}

const servers: import('node:http').Server[] = []
async function startApp(role: string | null): Promise<string> {
  const app = express()
  app.use(express.json())
  app.use('/api/email-admin', createEmailAdminRouter(fakeAuth(role) as any))
  const server = app.listen(0)
  servers.push(server)
  await new Promise((r) => server.once('listening', r))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/email-admin`
}
after(() => { for (const s of servers) s.close() })

async function call(base: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) as any }
}

const VALID = {
  name: 'Manager Review (custom)',
  subject: 'Ticket {{ticketNumber}} requires your review',
  htmlBody: '<p>Hello,</p><p>Ticket <strong>{{ticketNumber}}</strong> — {{ticketTitle}} is ready.</p><p><a href="{{ticketLink}}">Open ticket</a></p>',
}

// ─── Authorization ──────────────────────────────────────────────────────────

test('2. non-admin roles are rejected (403) on every template endpoint', async () => {
  for (const role of ['client', 'project_manager', 'developer']) {
    const base = await startApp(role)
    for (const [method, path, body] of [
      ['GET', '/templates'],
      ['GET', '/templates/manager_review'],
      ['PUT', '/templates/manager_review', VALID],
      ['DELETE', '/templates/manager_review'],
      ['POST', '/templates/manager_review/preview', VALID],
      ['GET', '/templates/manager_review/preview'],
    ] as const) {
      const r = await call(base, method, path, body)
      assert.equal(r.status, 403, `${role} ${method} ${path} must be 403`)
      assert.equal(r.body?.code, 'ADMIN_REQUIRED')
    }
  }
})

test('unauthenticated callers are rejected (401) before any handler runs', async () => {
  const base = await startApp(null)
  assert.equal((await call(base, 'GET', '/templates')).status, 401)
  assert.equal((await call(base, 'PUT', '/templates/manager_review', VALID)).status, 401)
})

// ─── Validation (admin) ─────────────────────────────────────────────────────

test('9. unknown eventType is rejected', async () => {
  const base = await startApp('admin')
  assert.equal((await call(base, 'PUT', '/templates/not_a_real_event', VALID)).status, 404)
  assert.equal((await call(base, 'GET', '/templates/not_a_real_event')).status, 404)
  assert.equal((await call(base, 'DELETE', '/templates/not_a_real_event')).status, 404)
})

async function expectInvalid(patch: Record<string, unknown>, expected: RegExp) {
  const base = await startApp('admin')
  const r = await call(base, 'PUT', '/templates/manager_review', { ...VALID, ...patch })
  assert.equal(r.status, 400, `expected 400 for ${JSON.stringify(patch).slice(0, 80)}`)
  assert.ok(Array.isArray(r.body?.errors) && r.body.errors.some((e: string) => expected.test(e)), `errors: ${JSON.stringify(r.body?.errors)}`)
}

test('10. empty subject is rejected', async () => {
  await expectInvalid({ subject: '   ' }, /Subject cannot be empty/)
})

test('11. empty body is rejected (including tags-only bodies)', async () => {
  await expectInvalid({ htmlBody: '' }, /Body cannot be empty/)
  await expectInvalid({ htmlBody: '<p> </p>' }, /Body cannot be empty/)
})

test('12. unsupported / malformed variables are rejected', async () => {
  await expectInvalid({ subject: 'Hi {{password}}' }, /unsupported variable/)
  await expectInvalid({ htmlBody: '<p>{{resetLink}}</p>' }, /unsupported variable/)
  await expectInvalid({ htmlBody: '<p>{{ticketNumber</p>' }, /malformed/)
  await expectInvalid({ htmlBody: '<p>{{ticket-number}}</p>' }, /not a valid placeholder/)
})

test('13. script / HTML injection is rejected', async () => {
  await expectInvalid({ htmlBody: '<p>x</p><script>alert(1)</script>' }, /not allowed/)
  await expectInvalid({ htmlBody: '<p>x</p><iframe src="https://evil.example"></iframe>' }, /not allowed/)
  await expectInvalid({ htmlBody: '<p onclick="steal()">x</p>' }, /event-handler/)
  await expectInvalid({ htmlBody: '<a href="javascript:alert(1)">x</a>' }, /javascript/)
  await expectInvalid({ htmlBody: '<img src="data:text/html,<b>x</b>">' }, /data:text\/html|must be an http/)
  await expectInvalid({ htmlBody: '<p>x</p><style>p{}</style>' }, /not allowed/)
  await expectInvalid({ subject: 'Hi <b>there</b>' }, /Subject cannot contain HTML/)
})

test('7/8. draft preview renders with sample data and never sends or queues', async () => {
  const base = await startApp('admin')
  const depth = queue.getQueueDepth()
  const r = await call(base, 'POST', '/templates/manager_review/preview', VALID)
  assert.equal(r.status, 200)
  assert.equal(r.body.subject, 'Ticket TKT-1001 requires your review')
  assert.match(r.body.html, /Login page not loading/)
  assert.equal(queue.getQueueDepth(), depth, 'preview must not enqueue')
})

// ─── Variables come from the real code templates ────────────────────────────

test('variables are derived from each real code template, and every default passes validation', () => {
  for (const entry of catalog.EMAIL_TEMPLATE_CATALOG) {
    const def = catalog.getCodeTemplateDefinition(entry.eventType)!
    assert.ok(def.subject && def.htmlBody, `${entry.eventType} default must render`)
    assert.ok(def.variables.includes('companyName'))
    const v = overrides.validateTemplateInput({ name: entry.label, subject: def.subject, htmlBody: def.htmlBody }, def.variables)
    assert.ok(v.ok, `${entry.eventType} default must be saveable: ${!v.ok ? v.errors.join('; ') : ''}`)
  }
  const mr = catalog.getCodeTemplateDefinition('manager_review')!
  assert.deepEqual(
    mr.variables.filter((v) => v !== 'companyName').sort(),
    ['recipientEmail', 'resolvedByName', 'ticketLink', 'ticketNumber', 'ticketTitle'].filter((k) => mr.variables.includes(k)).sort(),
  )
  assert.ok(!mr.variables.includes('password') && !mr.variables.includes('resetLink'))
})

// ─── Send path: override is used, code template is the fallback ─────────────

type Captured = { subject: string; html: string; text?: string; from: string }
function captureProvider(): Captured[] {
  const sent: Captured[] = []
  providers.registerProvider('test-capture', {
    name: 'test-capture',
    async send(params) {
      sent.push({ subject: params.subject, html: params.html, text: params.text, from: params.from })
      return { success: true, messageId: 'test', from: 'sender@example.com' }
    },
    async verifyConnection() { return true },
  })
  process.env.EMAIL_PROVIDER = 'test-capture'
  return sent
}

async function drain() {
  for (let i = 0; i < 20 && queue.getQueueDepth() > 0; i++) {
    await queue.processQueue()
    await new Promise((r) => setTimeout(r, 20))
  }
}

const MR_DATA = {
  ticketNumber: 'TKT-42',
  ticketTitle: 'Printer <b>offline</b> & "urgent"',
  resolvedByName: 'Sam',
  ticketLink: 'https://portal.example.com/dashboard/tickets/42',
}

test('6/15/16/18. edited template is used when sending; reset/inactive falls back to the code template', async () => {
  const sent = captureProvider()

  // No override → built-in code template (existing behaviour unchanged).
  overrides.setTemplateOverrides([])
  svc.sendManagerReview('pm@example.com', MR_DATA as any)
  await drain()
  assert.equal(sent.at(-1)!.subject, '[Review Needed #TKT-42] Printer <b>offline</b> & "urgent"')

  // Active override → used, through the SAME queue/provider, values HTML-escaped.
  overrides.setTemplateOverrides([{ eventType: 'manager_review', isActive: true, textBody: 'Ticket {{ticketNumber}} plain', ...VALID }])
  svc.sendManagerReview('pm@example.com', MR_DATA as any)
  await drain()
  const custom = sent.at(-1)!
  assert.equal(custom.subject, 'Ticket TKT-42 requires your review')
  assert.match(custom.html, /Printer &lt;b&gt;offline&lt;\/b&gt; &amp; &quot;urgent&quot;/, 'data values are HTML-escaped')
  assert.doesNotMatch(custom.html, /<b>offline<\/b>/)
  // Links are re-based onto FRONTEND_URL (localhost default in tests) — see email-frontend-links.test.ts.
  assert.ok(custom.html.includes('/dashboard/tickets/42"'), 'ticket link keeps its path')
  assert.match(custom.html, /<\/html>/i, 'custom content is wrapped in the branded baseWrapper')
  assert.equal(custom.text, 'Ticket TKT-42 plain')

  // Inactive override → code template.
  overrides.setTemplateOverrides([{ eventType: 'manager_review', isActive: false, textBody: null, ...VALID }])
  svc.sendManagerReview('pm@example.com', MR_DATA as any)
  await drain()
  assert.match(sent.at(-1)!.subject, /^\[Review Needed #TKT-42\]/)

  // Reset (no row) → code template again; other events never affected.
  overrides.setTemplateOverrides([{ eventType: 'manager_review', isActive: true, textBody: null, ...VALID }])
  svc.sendTicketClosed('client@example.com', { ticketNumber: 'TKT-7', ticketTitle: 'Done', closedBy: 'PM', feedbackLink: 'https://x.example' } as any)
  await drain()
  assert.match(sent.at(-1)!.subject, /^\[Closed #TKT-7\]/, 'an override for one event never changes other events')
  overrides.setTemplateOverrides([])
  svc.sendManagerReview('pm@example.com', MR_DATA as any)
  await drain()
  assert.match(sent.at(-1)!.subject, /^\[Review Needed #TKT-42\]/)
})

test('7. the existing template Preview uses the edited template (and still never sends)', () => {
  const depth = queue.getQueueDepth()
  overrides.setTemplateOverrides([{ eventType: 'manager_review', isActive: true, textBody: null, ...VALID }])
  const p = catalog.renderTemplatePreview('manager_review')!
  assert.equal(p.customized, true)
  assert.equal(p.subject, 'Ticket TKT-1001 requires your review')
  overrides.setTemplateOverrides([])
  const d = catalog.renderTemplatePreview('manager_review')!
  assert.equal(d.customized, false)
  assert.equal(d.subject, '[Review Needed #TKT-1001] Login page not loading')
  assert.equal(queue.getQueueDepth(), depth)
})

test('the editor default is the code template (never the saved override)', () => {
  overrides.setTemplateOverrides([{ eventType: 'manager_review', isActive: true, textBody: null, ...VALID }])
  const def = catalog.getCodeTemplateDefinition('manager_review')!
  assert.equal(def.subject, '[Review Needed #{{ticketNumber}}] {{ticketTitle}}')
  assert.doesNotMatch(def.htmlBody, /<html|<body/i, 'default body is the editable content only (no branded shell)')
  overrides.setTemplateOverrides([])
})
