// Billing classification (Backend mirror of Frontend lib/billing.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isBillableTicket } from '../src/lib/billing'

test('estimate workflow → Billable; Assign Directly → Non-Billable; historical + wallet hours → Billable', () => {
  assert.equal(isBillableTicket({ estimateWorkflowSkipped: false, assignedToId: 'd', consumedHours: 5 }), true)
  assert.equal(isBillableTicket({ estimateWorkflowSkipped: true, assignedToId: 'd', consumedHours: null }), false)
  assert.equal(isBillableTicket({ estimateWorkflowSkipped: true, assignedToId: null, consumedHours: 20 }), true)
  assert.equal(isBillableTicket({ estimateWorkflowSkipped: true, assignedToId: null, consumedHours: 0 }), false)
})

test('timers stamp from the ticket via the rule; reports use the shared SQL expression', () => {
  const src = join(__dirname, '..', 'src')
  const service = readFileSync(join(src, 'services', 'ticket.service.ts'), 'utf8')
  assert.doesNotMatch(service, /isBillable: true/)
  assert.match(service, /isBillableTicket\(await ticketRepo\.getBillingFacts\(ticketId\)\)/)
  const reports = readFileSync(join(src, 'controllers', 'reports', 'developer.reports.ts'), 'utf8')
  assert.match(reports, /\[timeLogIsBillable, gte\(/)
  assert.match(reports, /\[sql`NOT \$\{timeLogIsBillable\}`, gte\(/)
})
