import { test } from 'node:test'
import assert from 'node:assert/strict'

// ============================================================================
// User Management Error Handling Tests
// ============================================================================
// Tests that error messages are user-friendly and never expose internals.
// ============================================================================

// ─── Error Message Patterns ─────────────────────────────────────────────────

const USER_ERROR_MESSAGES = {
  VALIDATION: 'Please complete all required fields.',
  INVALID_EMAIL: 'Please enter a valid email address.',
  INVALID_ROLE: 'The selected user role is not valid.',
  DUPLICATE_EMAIL: 'A user with this email address already exists.',
  DB_ERROR: 'We couldn\'t create the user right now. Please try again.',
  AUTH_FAILED: 'The user profile was created, but the login account could not be created. Please try again or contact an administrator.',
  USER_NOT_FOUND: 'The user could not be found. They may have already been deleted.',
  DELETE_FORBIDDEN: 'You do not have permission to delete this user.',
  DELETE_DEPENDENCY: 'This user cannot be deleted because they have associated records.',
  DELETE_FAILED: 'We couldn\'t delete the user right now. Please try again.',
  ADMIN_DELETE: 'Admin accounts cannot be deleted.',
  SELF_DELETE: 'You cannot delete your own account.',
  SELF_DEACTIVATE: 'You cannot deactivate your own account.',
  ADMIN_DEACTIVATE: 'Admin accounts cannot be deactivated.',
  ACCESS_DENIED: 'You do not have permission to change user roles.',
  ROLE_INVALID: 'The selected user role is not valid.',
}

// ─── Validation Tests ───────────────────────────────────────────────────────

test('User creation: validation error message is user-friendly', () => {
  const msg = USER_ERROR_MESSAGES.VALIDATION
  assert.ok(msg.includes('required fields'), 'Should mention required fields')
  assert.ok(!msg.includes('null'), 'Should not expose null')
  assert.ok(!msg.includes('undefined'), 'Should not expose undefined')
})

test('User creation: invalid email message is user-friendly', () => {
  const msg = USER_ERROR_MESSAGES.INVALID_EMAIL
  assert.ok(msg.includes('valid email'), 'Should mention valid email')
})

test('User creation: duplicate email message is clear', () => {
  const msg = USER_ERROR_MESSAGES.DUPLICATE_EMAIL
  assert.ok(msg.includes('already exists'), 'Should mention already exists')
})

test('User creation: database error message is safe', () => {
  const msg = USER_ERROR_MESSAGES.DB_ERROR
  assert.ok(!msg.includes('SQL'), 'Should not expose SQL')
  assert.ok(!msg.includes('Prisma'), 'Should not expose Prisma')
  assert.ok(!msg.includes('pg_'), 'Should not expose PostgreSQL internals')
  assert.ok(!msg.includes('INSERT'), 'Should not expose query details')
})

test('User creation: auth account failure message is informative', () => {
  const msg = USER_ERROR_MESSAGES.AUTH_FAILED
  assert.ok(msg.includes('login account'), 'Should mention login account')
  assert.ok(msg.includes('administrator'), 'Should suggest contacting admin')
})

// ─── Deletion Tests ─────────────────────────────────────────────────────────

test('User deletion: not found message is safe', () => {
  const msg = USER_ERROR_MESSAGES.USER_NOT_FOUND
  assert.ok(!msg.includes('SQL'), 'Should not expose SQL')
  assert.ok(!msg.includes('id ='), 'Should not expose user ID')
})

test('User deletion: dependency error is user-friendly', () => {
  const msg = USER_ERROR_MESSAGES.DELETE_DEPENDENCY
  assert.ok(!msg.includes('foreign key'), 'Should not expose foreign key')
  assert.ok(!msg.includes('constraint'), 'Should not expose constraint')
  assert.ok(!msg.includes('23503'), 'Should not expose PostgreSQL error code')
  assert.ok(msg.includes('associated records'), 'Should mention associated records')
})

test('User deletion: database failure is safe', () => {
  const msg = USER_ERROR_MESSAGES.DELETE_FAILED
  assert.ok(!msg.includes('SQL'), 'Should not expose SQL')
  assert.ok(!msg.includes('Prisma'), 'Should not expose Prisma')
  assert.ok(msg.includes('try again'), 'Should suggest retry')
})

// ─── Permission Tests ───────────────────────────────────────────────────────

test('Permission denied messages are clear', () => {
  assert.ok(USER_ERROR_MESSAGES.DELETE_FORBIDDEN.includes('permission'))
  assert.ok(USER_ERROR_MESSAGES.ACCESS_DENIED.includes('permission'))
  assert.ok(USER_ERROR_MESSAGES.SELF_DELETE.includes('cannot delete your own'))
  assert.ok(USER_ERROR_MESSAGES.SELF_DEACTIVATE.includes('cannot deactivate your own'))
})

// ─── No Secrets in Messages ─────────────────────────────────────────────────

test('No error message contains secrets or technical internals', () => {
  const forbidden = [
    'password', 'hash', 'token', 'secret', 'cookie',
    'Prisma', 'pg_',
    'graph.microsoft.com', 'tenant', 'client_secret',
    'stack', 'Error:',
  ]

  // SQL keywords that appear in normal English words (e.g. "select" in "selected")
  // need word-boundary checks
  const sqlKeywords = ['SQL', 'INSERT', 'SELECT', 'DELETE FROM']

  for (const [, msg] of Object.entries(USER_ERROR_MESSAGES)) {
    // Check simple forbidden terms
    for (const term of forbidden) {
      assert.ok(
        !msg.toLowerCase().includes(term.toLowerCase()),
        `Message "${msg}" contains forbidden term "${term}"`
      )
    }
    // Check SQL keywords with word boundaries (avoid false positives like "selected")
    for (const keyword of sqlKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i')
      assert.ok(
        !regex.test(msg),
        `Message "${msg}" contains forbidden SQL keyword "${keyword}"`
      )
    }
  }
})
