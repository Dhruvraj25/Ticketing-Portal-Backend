import { test } from 'node:test'
import assert from 'node:assert/strict'
import { welcomeTemplate } from '../src/services/email/templates/welcome'
import { ticketCreatedTemplate } from '../src/services/email/templates/ticket-created'
import { passwordResetTemplate } from '../src/services/email/templates/password-reset'
import { ticketResolvedTemplate } from '../src/services/email/templates/ticket-resolved'
import { loginCredentialsTemplate } from '../src/services/email/templates/login-credentials'
import { customerCreatedTemplate } from '../src/services/email/templates/customer-created'
import { accountActivatedTemplate } from '../src/services/email/templates/account-activated'
import { managerReviewTemplate } from '../src/services/email/templates/manager-review'
import { reworkTemplate } from '../src/services/email/templates/rework'
import { getBranding } from '../src/services/email/templates/base.template'

const PROD_URL = 'https://portal.example.com'
const branding = { ...getBranding(), companyName: 'Support Hero', portalUrl: PROD_URL }

test('branding: default company name is Support Hero', () => {
  assert.equal(getBranding().companyName, 'Support Hero')
})

test('email: templates use Support Hero branding, never Support Hero', () => {
  const samples = [
    welcomeTemplate({ userEmail: 'a@b.com', loginUrl: `${PROD_URL}/sign-in` }, branding),
    ticketCreatedTemplate({ ticketNumber: 'TKT-1', ticketTitle: 'Bug', priority: 'high', createdBy: 'Alice', createdDate: '2026-01-01', ticketLink: `${PROD_URL}/dashboard/tickets/1` }, branding),
    passwordResetTemplate({ userEmail: 'a@b.com', resetLink: `${PROD_URL}/reset?t=x` }, branding),
    ticketResolvedTemplate({ ticketNumber: 'TKT-1', ticketTitle: 'Bug', resolvedBy: 'Dev', ticketLink: `${PROD_URL}/dashboard/tickets/1` }, branding),
    loginCredentialsTemplate({ userEmail: 'a@b.com', initialPassword: 'pw', loginUrl: `${PROD_URL}/sign-in` }, branding),
    customerCreatedTemplate({ customerName: 'Acme', customerEmail: 'a@b.com', createdBy: 'Admin', portalUrl: `${PROD_URL}/sign-in` }, branding),
    accountActivatedTemplate({ userName: 'Bob', userEmail: 'b@c.com', loginUrl: `${PROD_URL}/sign-in` }, branding),
    managerReviewTemplate({ ticketNumber: 'TKT-1', ticketTitle: 'Bug', resolvedByName: 'Dana Dev', ticketLink: `${PROD_URL}/dashboard/tickets/1` }, branding),
    reworkTemplate({ ticketNumber: 'TKT-1', ticketTitle: 'Bug', requestedByName: 'Mary Manager', revisionNotes: 'Please fix the login flow', ticketLink: `${PROD_URL}/dashboard/tickets/1` }, branding),
  ]

  for (const html of samples) {
    assert.ok(html.includes('Support Hero'), 'expected Support Hero branding in email')
    assert.ok(!html.includes('Support Hero'), 'Support Hero must not appear in emails')
    assert.ok(!html.includes('localhost:3000'), 'localhost:3000 must never appear in emails')
    assert.ok(!html.includes('http://localhost'), 'localhost links must never appear in emails')
  }
})

test('email: buttons and links use the configured frontend URL', () => {
  const html = welcomeTemplate({ userEmail: 'a@b.com', loginUrl: `${PROD_URL}/sign-in` }, branding)
  assert.ok(html.includes(`href="${PROD_URL}/sign-in"`), 'login button must point at the configured frontend URL')
  assert.ok(!html.includes('Support Hero.app'), 'no hardcoded portal domain')
})

test('email: ticket action button points at the configured ticket URL', () => {
  const html = ticketCreatedTemplate(
    { ticketNumber: 'TKT-1', ticketTitle: 'Bug', priority: 'high', createdBy: 'Alice', createdDate: '2026-01-01', ticketLink: `${PROD_URL}/dashboard/tickets/42` },
    branding,
  )
  assert.ok(html.includes(`${PROD_URL}/dashboard/tickets/42`))
})

test('email: awaiting client review template uses the configured URL', () => {
  const html = ticketResolvedTemplate(
    { ticketNumber: 'TKT-2', ticketTitle: 'Feature', resolvedBy: 'Dev', ticketLink: `${PROD_URL}/dashboard/tickets/43` },
    branding,
  )
  assert.ok(html.includes(`${PROD_URL}/dashboard/tickets/43`))
})

// ─── Manager Review / Rework — known-issue fix: templates now exist ───────

test('email: manager review template renders recipient-relevant content and the configured URL', () => {
  const html = managerReviewTemplate(
    { ticketNumber: 'TKT-7', ticketTitle: 'Login bug', resolvedByName: 'Dana Dev', ticketLink: `${PROD_URL}/dashboard/tickets/7` },
    branding,
  )
  assert.ok(html.includes(`${PROD_URL}/dashboard/tickets/7`), 'must link to the configured frontend URL')
  assert.ok(html.includes('TKT-7'))
  assert.ok(html.includes('Dana Dev'), 'must name who resolved it')
  assert.ok(html.includes('Support Hero'))
  assert.ok(!html.includes('Support Hero'))
  assert.ok(!html.includes('localhost'))
})

test('email: rework template renders the manager\'s instructions and the configured URL, never the client', () => {
  const html = reworkTemplate(
    { ticketNumber: 'TKT-8', ticketTitle: 'Signup form', requestedByName: 'Mary Manager', revisionNotes: 'Validate the email field before submit', ticketLink: `${PROD_URL}/dashboard/tickets/8` },
    branding,
  )
  assert.ok(html.includes(`${PROD_URL}/dashboard/tickets/8`), 'must link to the configured frontend URL')
  assert.ok(html.includes('TKT-8'))
  assert.ok(html.includes('Mary Manager'), 'must name the manager who requested rework')
  assert.ok(html.includes('Validate the email field before submit'), 'must include the rework notes')
  assert.ok(html.includes('Support Hero'))
  assert.ok(!html.includes('Support Hero'))
  assert.ok(!html.includes('localhost'))
  // This template is developer-facing only — it must never claim to be from
  // or addressed to the client, or reference client-approval language.
  assert.ok(!html.toLowerCase().includes('client approval'))
})