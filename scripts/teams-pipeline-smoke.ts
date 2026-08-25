// ============================================================================
// Teams Pipeline Regression Test (MOCK MODE ONLY)
// ============================================================================
// Verifies the backend Teams pipeline for every event type WITHOUT sending any
// real message. TEAMS_WEBHOOK_URL is forcibly cleared so the mock webhook path
// is used — no real Teams channel is ever contacted.
//
// Checks per event type:
//   1. Adaptive Card generation        — buildAdaptiveCard() returns a card
//   2. Card content                    — title/message rendered as TextBlocks
//   3. Open-in-Portal action           — present when a url is supplied
//   4. Mention generation              — buildMention() resolves name + email
//   5. No-missing-template             — no 'No card template' fallback warning
//   6. Exactly one mock delivery       — each event dispatches once (no dup)
//   7. Graceful no-recipient case      — no mention when recipient info absent
//
// Scope note: recipient RESOLUTION (loading users), the DB-level dedup claim,
// and the client Teams toggle live in the frontend dispatcher (8/lib) and are
// covered by 8/tests/notification-utils.test.mjs. This script verifies the
// backend delivery pipeline only — it does NOT replace live Desktop/Web testing.
//
// Run: npx tsx scripts/teams-pipeline-smoke.ts
// Exit code 0 = all checks passed.
// ============================================================================

process.env.TEAMS_WEBHOOK_URL = '' // ← force mock mode, never POST to the real webhook

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendTeamsNotification, buildAdaptiveCard, buildMention } = require('../src/services/teams/teams.service')

const EVENTS = [
  'ticket_created',
  'ticket_updated',
  'ticket_assigned',
  'ticket_reassigned',
  'ticket_resolved',
  'ticket_closed',
  'ticket_reopened',
  'customer_created',
  'account_activated',
  'estimate_requested',
  'estimate_approved',
  'estimate_rejected',
  'revision_requested',
  'revision_approved',
  'revision_rejected',
  'additional_hours_requested',
  'additional_hours_approved',
  'additional_hours_rejected',
  'developer_started_work',
  'developer_completed_work',
  'wallet_low',
  'wallet_empty',
  'support_hours_added',
  'support_hours_assigned',
  'new_project',
  'welcome',
  'password_reset',
  'support_renewal_reminder',
  'test_message',
] as const

function payloadFor(ev: string) {
  return {
    title: 'Smoke: ' + ev,
    message: 'Pipeline smoke test for event ' + ev,
    ticketNumber: 'TKT-SMOKE',
    ticketTitle: 'Smoke test ticket',
    projectName: 'Smoke Project',
    priority: 'High',
    status: 'in_progress',
    clientName: 'Smoke Client',
    createdBy: 'Smoke Actor',
    developerName: 'Smoke Dev',
    estimateHours: '8h',
    additionalHours: '4h',
    revisionNumber: '1',
    revisionNotes: 'Smoke revision notes',
    reason: 'Smoke reason',
    assignedHours: '10',
    remainingBalance: 40,
    url: 'http://localhost:3000/dashboard',
    recipientName: 'Smoke Recipient',
    recipientEmail: 'smoke@example.com',
  }
}

function collectText(card: any): string[] {
  const out: string[] = []
  const walk = (items: any[]) => {
    for (const it of items || []) {
      if (it.type === 'TextBlock') out.push(it.text || '')
      if (it.facts && Array.isArray(it.facts)) for (const f of it.facts) out.push(f.title + ': ' + f.value)
      if (it.items) walk(it.items)
      if (it.columns) for (const c of it.columns) walk(c.items)
      if (it.actions) for (const a of it.actions) out.push('ACTION:' + a.title)
    }
  }
  walk(card?.body)
  if (card?.actions) for (const a of card.actions) out.push('ACTION:' + a.title)
  return out
}

async function main() {
  console.log('=== Teams pipeline regression test (MOCK MODE) ===')
  console.log('Event types under test: ' + EVENTS.length)

  let pass = 0
  let fail = 0
  const failures: string[] = []

  const check = (label: string, ok: boolean) => {
    if (ok) { pass++ } else { fail++; failures.push(label) }
    console.log('  [' + (ok ? 'PASS' : 'FAIL') + '] ' + label)
  }

  // ── Capture mock console output so we can count deliveries ─────────────
  const captured: string[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => { captured.push(args.join(' ')) }

  for (const ev of EVENTS) {
    sendTeamsNotification(ev, payloadFor(ev) as any)
  }
  await new Promise((resolve) => setTimeout(resolve, 1500)) // flush mock deliveries
  console.log = originalLog

  // ── Per-event static checks (no console dependency) ────────────────────
  for (const ev of EVENTS) {
    const payload = payloadFor(ev)
    const card = buildAdaptiveCard(ev, payload as any)

    check(ev + ': card built', !!card)
    if (card) {
      const text = collectText(card)
      // Dedicated card builders generate their own title/message from payload
      // fields (e.g. 'New Ticket TKT-SMOKE'), so assert on the rendered
      // structure + payload data instead of the raw title/message strings.
      check(ev + ': card renders title + message blocks', text.length >= 2)
      check(ev + ': card contains payload data (project)', text.some((t) => t.includes('Smoke Project')))
      check(ev + ': card has Open-in-Portal action', text.some((t) => t.startsWith('ACTION:Open in Portal')))
    }

    const mention = buildMention(payload as any)
    check(ev + ': mention generated from name+email', !!mention && mention.name === 'Smoke Recipient' && mention.id === 'smoke@example.com')
  }

  // ── Graceful no-recipient case ─────────────────────────────────────────
  const noRecipient = buildMention({ ...payloadFor('ticket_created'), recipientName: '', recipientEmail: '' } as any)
  check('no-recipient payload → no mention (graceful)', noRecipient === null)
  const noName = buildMention({ ...payloadFor('ticket_created'), recipientName: '   ' } as any)
  check('blank recipient name → no mention (graceful)', noName === null)

  // ── Delivery accounting from mock output ───────────────────────────────
  const missingTemplate = captured.filter((l) => l.includes('No card template'))
  check('no missing card templates (0 "No card template")', missingTemplate.length === 0)

  const mockBanners = captured.filter((l) => l.includes('Teams Notification (MOCK MODE'))
  check('exactly one mock delivery per event (' + EVENTS.length + ')', mockBanners.length === EVENTS.length)

  const mentionLines = captured.filter((l) => l.includes('Mention:  @Smoke Recipient'))
  check('mention attached on every delivered event (' + EVENTS.length + ')', mentionLines.length === EVENTS.length)

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('')
  console.log('=== Summary ===')
  console.log('Checks passed: ' + pass)
  console.log('Checks failed: ' + fail)
  if (failures.length > 0) {
    console.log('Failures:')
    for (const f of failures) console.log('  - ' + f)
    process.exit(1)
  }
  console.log('=== ALL TEAMS PIPELINE CHECKS PASSED (mock mode) ===')
}

main().catch((err) => {
  console.error('Smoke test failed with an unexpected error:', err)
  process.exit(1)
})
