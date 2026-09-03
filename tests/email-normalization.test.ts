import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeEmail, sameEmail, isValidEmail } from '../src/utils/email'

test('email: normalizeEmail lowercases and trims', () => {
  assert.equal(normalizeEmail('  User@Company.com  '), 'user@company.com')
  assert.equal(normalizeEmail('USER@COMPANY.COM'), 'user@company.com')
  assert.equal(normalizeEmail(undefined), '')
  assert.equal(normalizeEmail(null), '')
})

test('email: sameEmail is case-insensitive', () => {
  assert.equal(sameEmail('User@Company.com', 'user@company.com'), true)
  assert.equal(sameEmail('a@b.com', 'a@c.com'), false)
})

test('email: isValidEmail validates', () => {
  assert.equal(isValidEmail('user@company.com'), true)
  assert.equal(isValidEmail('User@Company.com'), true)
  assert.equal(isValidEmail('not-an-email'), false)
  assert.equal(isValidEmail(''), false)
})