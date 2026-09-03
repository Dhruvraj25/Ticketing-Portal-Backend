import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getFrontendUrl } from '../src/utils/frontend-url'

const ORIGINAL = process.env.FRONTEND_URL
const ORIGINAL_NODE_ENV = process.env.NODE_ENV

test.after(() => {
  if (ORIGINAL === undefined) delete process.env.FRONTEND_URL
  else process.env.FRONTEND_URL = ORIGINAL
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV
})

test('frontend-url: configured URL is returned without trailing slash', () => {
  process.env.FRONTEND_URL = 'https://portal.example.com/'
  process.env.NODE_ENV = 'production'
  assert.equal(getFrontendUrl(), 'https://portal.example.com')
})

test('frontend-url: development falls back to localhost when unset', () => {
  delete process.env.FRONTEND_URL
  process.env.NODE_ENV = 'development'
  assert.equal(getFrontendUrl(), 'http://localhost:3000')
})

test('frontend-url: production NEVER falls back to localhost', () => {
  delete process.env.FRONTEND_URL
  process.env.NODE_ENV = 'production'
  assert.throws(() => getFrontendUrl(), /FRONTEND_URL is not configured/)
})