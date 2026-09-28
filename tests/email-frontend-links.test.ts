import { test, before } from 'node:test'
import assert from 'node:assert/strict'

// ============================================================================
// Email application links always use FRONTEND_URL (never localhost)
// ============================================================================
// Runs the REAL senders → REAL queue → a stand-in provider, with production
// settings and template data deliberately carrying localhost links (as built
// by a frontend running locally). No database is used.
// ============================================================================

const PROD = 'https://ticketing-portal-sand.vercel.app'
delete process.env.DATABASE_URL
process.env.NODE_ENV = 'production'
process.env.FRONTEND_URL = PROD

let svc: typeof import('../src/services/email/email.service')
let queue: typeof import('../src/services/email/email.queue')
let providers: typeof import('../src/services/email/email.provider')
let catalog: typeof import('../src/services/email/email-template-catalog')
let overrides: typeof import('../src/services/email/email-template-overrides')
let urls: typeof import('../src/utils/frontend-url')
const sent: { subject: string; html: string }[] = []

before(async () => {
  svc = await import('../src/services/email/email.service')
  queue = await import('../src/services/email/email.queue')
  providers = await import('../src/services/email/email.provider')
  catalog = await import('../src/services/email/email-template-catalog')
  overrides = await import('../src/services/email/email-template-overrides')
  urls = await import('../src/utils/frontend-url')
  providers.registerProvider('links-capture', {
    name: 'links-capture',
    async send(p) { sent.push({ subject: p.subject, html: p.html }); return { success: true, messageId: 'x' } },
    async verifyConnection() { return true },
  })
  process.env.EMAIL_PROVIDER = 'links-capture'
})

async function sendAndCapture(fn: () => unknown): Promise<string> {
  const before = sent.length
  fn()
  for (let i = 0; i < 20 && queue.getQueueDepth() > 0; i++) {
    await queue.processQueue()
    await new Promise((r) => setTimeout(r, 10))
  }
  assert.equal(sent.length, before + 1, 'exactly one email must be sent')
  return sent[sent.length - 1].html
}

function assertProdLinks(html: string, paths: string[]) {
  assert.doesNotMatch(html, /localhost/i, 'no localhost link may appear in a production email')
  for (const p of paths) assert.ok(html.includes(`href="${PROD}${p}"`), `expected link ${PROD}${p}`)
  assert.ok(html.includes(`href="${PROD}"`), 'footer portal link uses FRONTEND_URL')
}

const LOCAL = 'http://localhost:3000'

test('helper: links are re-based onto FRONTEND_URL, keeping path/query/hash; non-app values untouched', () => {
  assert.equal(urls.toFrontendLink(`${LOCAL}/dashboard/tickets/123?tab=1#c`), `${PROD}/dashboard/tickets/123?tab=1#c`)
  assert.equal(urls.toFrontendLink('/sign-in'), `${PROD}/sign-in`)
  assert.equal(urls.toFrontendLink('{{ticketLink}}'), '{{ticketLink}}')
  const logo = 'https://res.cloudinary.com/demo/logo.png'
  const out = urls.withFrontendLinks({ ticketLink: `${LOCAL}/dashboard/projects/64`, companyLogoUrl: logo, other: `${LOCAL}/x` }) as any
  assert.equal(out.ticketLink, `${PROD}/dashboard/projects/64`)
  assert.equal(out.companyLogoUrl, logo, 'external URLs (logo) are never rewritten')
  assert.equal(out.other, `${LOCAL}/x`, 'only known application link fields are rewritten')
})

test('FRONTEND_URL configured without a scheme still yields https links', () => {
  process.env.FRONTEND_URL = 'ticketing-portal-sand.vercel.app/'
  try {
    assert.equal(urls.getFrontendUrl(), PROD)
  } finally {
    process.env.FRONTEND_URL = PROD
  }
})

test('1. ticket notification', async () => {
  const html = await sendAndCapture(() => svc.sendTicketCreated('pm@example.com', {
    ticketNumber: 'T-1', ticketTitle: 'x', priority: 'high', createdBy: 'a', createdDate: new Date().toISOString(),
    ticketLink: `${LOCAL}/dashboard/tickets/123`,
  } as any))
  assertProdLinks(html, ['/dashboard/tickets/123'])
})

test('2. manager review', async () => {
  const html = await sendAndCapture(() => svc.sendManagerReview('pm@example.com', {
    ticketNumber: 'T-1', ticketTitle: 'x', resolvedByName: 'dev', ticketLink: `${LOCAL}/dashboard/tickets/9`,
  } as any))
  assertProdLinks(html, ['/dashboard/tickets/9'])
})

test('3. client approval (estimate requested)', async () => {
  const html = await sendAndCapture(() => svc.sendEstimateRequested('client@example.com', {
    ticketNumber: 'T-1', ticketTitle: 'x', estimatedHours: 5, estimateNotes: '', approvalDeadline: '', ticketLink: `${LOCAL}/dashboard/tickets/1995`,
  } as any))
  assertProdLinks(html, ['/dashboard/tickets/1995'])
})

test('4. rework', async () => {
  const html = await sendAndCapture(() => svc.sendRework('dev@example.com', {
    ticketNumber: 'T-1', ticketTitle: 'x', reworkNotes: 'fix', requestedBy: 'pm', ticketLink: `${LOCAL}/dashboard/tickets/5`,
  } as any))
  assertProdLinks(html, ['/dashboard/tickets/5'])
})

test('5. additional hours', async () => {
  const html = await sendAndCapture(() => svc.sendAdditionalHours('client@example.com', {
    ticketNumber: 'T-1', ticketTitle: 'x', requestedHours: 3, reason: 'more', ticketLink: `${LOCAL}/dashboard/tickets/6`,
  } as any))
  assertProdLinks(html, ['/dashboard/tickets/6'])
})

test('6. renewal request', async () => {
  const html = await sendAndCapture(() => svc.sendSupportRenewalRequest('pm@example.com', {
    clientName: 'c', clientEmail: 'c@example.com', projectNames: ['P'], walletLink: `${LOCAL}/dashboard/wallets/7`,
  } as any))
  assertProdLinks(html, ['/dashboard/wallets/7'])
})

test('7. password reset (token/query preserved, only the base changes)', async () => {
  const html = await sendAndCapture(() => svc.sendPasswordReset('user@example.com', {
    userName: 'u', resetLink: `${LOCAL}/reset-password?token=abc123`,
  } as any))
  assertProdLinks(html, ['/reset-password?token=abc123'])
})

test('customer-created / login links (portalUrl — previously not normalized at all)', async () => {
  const html = await sendAndCapture(() => svc.sendCustomerCreated('new@example.com', {
    customerName: 'Acme', customerEmail: 'new@example.com', createdBy: 'admin', portalUrl: `${LOCAL}/sign-in`,
  } as any))
  assertProdLinks(html, ['/sign-in'])
})

test('8. Admin → Email Management template preview uses the same FRONTEND_URL', () => {
  const depth = queue.getQueueDepth()
  for (const entry of catalog.EMAIL_TEMPLATE_CATALOG) {
    const p = catalog.renderTemplatePreview(entry.eventType)!
    assert.doesNotMatch(p.html, /localhost|portal\.example\.com/, `${entry.eventType} preview links must use FRONTEND_URL`)
    assert.ok(p.html.includes(PROD), `${entry.eventType} preview contains FRONTEND_URL`)
  }
  assert.equal(queue.getQueueDepth(), depth, 'previews never send')
})

test('an admin-customized template also gets FRONTEND_URL links', async () => {
  overrides.setTemplateOverrides([{
    eventType: 'manager_review', isActive: true, textBody: null, name: 'x',
    subject: 'Review {{ticketNumber}}', htmlBody: '<p><a href="{{ticketLink}}">Open</a></p>',
  }])
  try {
    const html = await sendAndCapture(() => svc.sendManagerReview('pm@example.com', {
      ticketNumber: 'T-2', ticketTitle: 'x', resolvedByName: 'dev', ticketLink: `${LOCAL}/dashboard/tickets/10`,
    } as any))
    assertProdLinks(html, ['/dashboard/tickets/10'])
  } finally {
    overrides.setTemplateOverrides([])
  }
})

test('template variables are not polluted by link re-basing', () => {
  const vars = catalog.getCodeTemplateDefinition('manager_review')!.variables
  assert.ok(!vars.includes('walletLink') && !vars.includes('resetLink') && !vars.includes('portalUrl'))
})

test('editor draft preview also uses FRONTEND_URL links', () => {
  const d = catalog.renderDraftPreview('manager_review', { subject: 'S {{ticketNumber}}', htmlBody: '<p><a href="{{ticketLink}}">Open</a></p>' })!
  assert.ok(d.html.includes(`href="${PROD}/dashboard/tickets/1001"`))
  assert.doesNotMatch(d.html, /localhost|portal\.example\.com/)
})
