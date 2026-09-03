import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeTicketForRole, serializeTicketsForRole, filterHistoryForClient, isClientSafeActivity } from '../src/lib/ticket-privacy'

const fullTicket = {
  id: 1,
  ticketNumber: 'TKT-1',
  title: 'Bug',
  status: 'in_progress',
  clientId: 'client-a',
  assignedToId: 'dev-1',
  assignedById: 'mgr-1',
  assignedAt: new Date(),
  overrideBy: 'admin-1',
  estimateApprovedBy: 'mgr-1',
  additionalHoursApprovedBy: 'mgr-1',
  reservedHours: 5,
  consumedHours: 2,
  estimatedHours: 10,
  createdAt: new Date(),
}

test('privacy: client ticket omits internal fields', () => {
  const out = serializeTicketForRole(fullTicket as any, 'client')
  assert.equal(out.assignedToId, undefined)
  assert.equal(out.assignedById, undefined)
  assert.equal(out.overrideBy, undefined)
  assert.equal(out.estimateApprovedBy, undefined)
  assert.equal(out.additionalHoursApprovedBy, undefined)
  assert.equal(out.reservedHours, undefined)
  assert.equal(out.consumedHours, undefined)
  // Client-visible data is preserved
  assert.equal(out.ticketNumber, 'TKT-1')
  assert.equal(out.status, 'in_progress')
  assert.equal(out.estimatedHours, 10)
})

test('privacy: manager/developer receive the full ticket', () => {
  for (const role of ['project_manager', 'developer', 'admin']) {
    const out = serializeTicketForRole(fullTicket as any, role)
    assert.equal(out.assignedToId, 'dev-1')
  }
})

test('privacy: client list serialization applies to every row', () => {
  const out = serializeTicketsForRole([fullTicket as any, { ...fullTicket, id: 2 }], 'client')
  assert.equal(out.length, 2)
  assert.equal(out[0].assignedToId, undefined)
  assert.equal(out[1].assignedToId, undefined)
})

test('privacy: client-safe activities whitelist', () => {
  assert.equal(isClientSafeActivity({ action: 'created' }), true)
  assert.equal(isClientSafeActivity({ action: 'override_created' }), true)
  assert.equal(isClientSafeActivity({ action: 'closed' }), true)
  assert.equal(isClientSafeActivity({ action: 'status_change', newValue: 'Status changed to closed' }), true)
  assert.equal(isClientSafeActivity({ action: 'status_change', newValue: 'Status changed to in_progress' }), false)
  assert.equal(isClientSafeActivity({ action: 'assigned' }), false)
  assert.equal(isClientSafeActivity({ action: 'timer_started' }), false)
  assert.equal(isClientSafeActivity({ action: 'status_change', newValue: 'Status changed to manager_review' }), false)
})

test('privacy: client history filter removes internal activity and identity', () => {
  const history = [
    { id: 1, action: 'created', newValue: 'Ticket created', userId: 'client-a', userName: 'Alice', userRole: 'client', createdAt: new Date() },
    { id: 2, action: 'assigned', newValue: 'Assigned to developer dev-1', userId: 'mgr-1', userName: 'Manager', userRole: 'project_manager', createdAt: new Date() },
    { id: 3, action: 'timer_started', newValue: 'Timer started', userId: 'dev-1', userName: 'Dev', userRole: 'developer', createdAt: new Date() },
    { id: 4, action: 'status_change', newValue: 'Status changed to closed', userId: 'mgr-1', userName: 'Manager', userRole: 'project_manager', createdAt: new Date() },
  ]
  const out = filterHistoryForClient(history as any)
  assert.equal(out.length, 2)
  assert.equal(out[0].action, 'created')
  assert.equal(out[1].action, 'status_change')
  // No developer/manager identity leaks
  for (const entry of out) {
    assert.equal((entry as any).userId, undefined)
    assert.equal((entry as any).userName, undefined)
    assert.equal((entry as any).userRole, undefined)
  }
})