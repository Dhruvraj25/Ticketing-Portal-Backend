import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWindowDedupe } from '../src/utils/window-dedupe'

// Requirement #4 — approval emails: every DISTINCT approval event must send,
// while a duplicate retry of THE SAME event must not create a duplicate email.
// The bridge keys each approval cycle with its own idempotencyKey; the window
// dedupe suppresses only exact repeats of the same key.

test('dedupe: a fresh approval key is never a duplicate (approval #1 sends)', () => {
  const d = createWindowDedupe(5 * 60 * 1000)
  assert.equal(d.isDuplicate('approval-cycle-1'), false)
})

test('dedupe: a SECOND distinct approval key is also sent (approval #2 sends)', () => {
  const d = createWindowDedupe(5 * 60 * 1000)
  assert.equal(d.isDuplicate('approval-cycle-1'), false)
  assert.equal(d.isDuplicate('approval-cycle-2'), false)
  assert.equal(d.isDuplicate('approval-cycle-3'), false)
})

test('dedupe: retrying the SAME approval key within the window is suppressed', () => {
  const d = createWindowDedupe(5 * 60 * 1000)
  assert.equal(d.isDuplicate('approval-cycle-1'), false)
  assert.equal(d.isDuplicate('approval-cycle-1'), true)
  assert.equal(d.isDuplicate('approval-cycle-1'), true)
})

test('dedupe: no key means no suppression (caller opts out of idempotency)', () => {
  const d = createWindowDedupe(5 * 60 * 1000)
  assert.equal(d.isDuplicate(undefined), false)
  assert.equal(d.isDuplicate(undefined), false)
  assert.equal(d.isDuplicate(''), false)
})

test('dedupe: same key after the window expires is treated as a new event', async () => {
  const d = createWindowDedupe(20) // 20 ms window
  assert.equal(d.isDuplicate('approval-cycle-1'), false)
  assert.equal(d.isDuplicate('approval-cycle-1'), true)
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(d.isDuplicate('approval-cycle-1'), false)
})

test('dedupe: distinct keys are never cross-suppressed', () => {
  const d = createWindowDedupe(5 * 60 * 1000)
  d.isDuplicate('a')
  assert.equal(d.isDuplicate('b'), false)
  assert.equal(d.isDuplicate('b'), true) // exact repeat only
  assert.equal(d.isDuplicate('a'), true)
})
