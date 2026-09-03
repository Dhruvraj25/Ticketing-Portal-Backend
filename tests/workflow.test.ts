import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateStatusTransition } from '../src/lib/ticket-workflow'

test('workflow: developer completing work moves to manager_review', () => {
  assert.equal(validateStatusTransition('in_progress', 'manager_review', 'developer'), null)
})

test('workflow: developer CANNOT move ticket directly to client_review', () => {
  const err = validateStatusTransition('in_progress', 'client_review', 'developer')
  assert.ok(err, 'expected developer → client_review to be rejected')
})

test('workflow: developer CANNOT move ticket directly to resolved', () => {
  const err = validateStatusTransition('in_progress', 'resolved', 'developer')
  assert.ok(err, 'expected developer → resolved to be rejected')
})

test('workflow: manager can forward manager_review → client_review', () => {
  assert.equal(validateStatusTransition('manager_review', 'client_review', 'project_manager'), null)
})

test('workflow: manager can send manager_review → rework', () => {
  assert.equal(validateStatusTransition('manager_review', 'rework', 'project_manager'), null)
})

test('workflow: client revision request → request_for_revision', () => {
  assert.equal(validateStatusTransition('client_review', 'request_for_revision', 'client'), null)
})

test('workflow: client approving → closed', () => {
  assert.equal(validateStatusTransition('client_review', 'closed', 'client'), null)
})

test('workflow: client CANNOT trigger manager rework', () => {
  const err = validateStatusTransition('client_review', 'rework', 'client')
  assert.ok(err, 'expected client → rework to be rejected')
})

test('workflow: client CANNOT start work', () => {
  const err = validateStatusTransition('assigned', 'in_progress', 'client')
  assert.ok(err, 'expected client → in_progress to be rejected')
})

test('workflow: admin can do anything valid in the transition map', () => {
  assert.equal(validateStatusTransition('rework', 'in_progress', 'admin'), null)
})

test('workflow: invalid transition rejected (closed → client_review)', () => {
  const err = validateStatusTransition('closed', 'client_review', 'admin')
  assert.ok(err, 'expected closed → client_review to be rejected')
})

test('workflow: unknown target status rejected', () => {
  const err = validateStatusTransition('new', 'banana', 'admin')
  assert.ok(err && /unknown ticket status/i.test(err))
})

test('workflow: unknown current state rejected', () => {
  const err = validateStatusTransition('mystery', 'closed', 'admin')
  assert.ok(err, 'expected unknown current state to be rejected')
})

test('workflow: legacy "open" alias normalizes to "new"', () => {
  assert.equal(validateStatusTransition('open', 'manager_review', 'project_manager'), null)
})