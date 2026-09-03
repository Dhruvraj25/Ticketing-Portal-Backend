import { test } from 'node:test'
import assert from 'node:assert/strict'
import { welcomeTemplate } from '../src/services/email/templates/welcome'
import { ticketCreatedTemplate } from '../src/services/email/templates/ticket-created'
import { passwordResetTemplate } from '../src/services/email/templates/password-reset'
import { ticketResolvedTemplate } from '../src/services/email/templates/ticket-resolved'
import { loginCredentialsTemplate } from '../src/services/email/templates/login-credentials'
import { customerCreatedTemplate } from '../src/services/email/templates/customer-created'
import { accountActivatedTemplate } from '../src/services/email/templates/account-activated'
import { getBranding } from '../src/services/email/templates/base.template'

const PROD_URL = 'https://portal.example.com'
const branding = { ...getBranding(), companyName: 'Support Hero', portalUrl: PROD_URL }

test('branding: default company name is Support Hero', () => {
  assert.equal(getBranding().companyName, 'Support Hero')
})

test('email: templates use Support Hero branding, never SupportHub', () => {
  const samples = [
    welcomeTemplate({ userEmail: 'a@b.com', loginUrl: `${PROD_URL}/sign-in` }, branding),
    ticketCreatedTemplate({ ticketNumber: 'TKT-1', ticketTitle: 'Bug', priority: 'high', createdBy: 'Alice', createdDate: '2026-01-01', ticketLink: `${PROD_URL}/dashboard/tickets/1` }, branding),
    passwordResetTemplate({ userEmail: 'a@b.com', resetLink: `${PROD_URL}/reset?t=x` }, branding),
    ticketResolvedTemplate({ ticketNumber: 'TKT-1', ticketTitle: 'Bug', resolvedBy: 'Dev', ticketLink: `${PROD_URL}/dashboard/tickets/1` }, branding),
    loginCredentialsTemplate({ userEmail: 'a@b.com', initialPassword: 'pw', loginUrl: `${PROD_URL}/sign-in` }, branding),
    customerCreatedTemplate({ customerName: 'Acme', customerEmail: 'a@b.com', createdBy: 'Admin', portalUrl: `${PROD_URL}/sign-in` }, branding),
    accountActivatedTemplate({ userName: 'Bob', userEmail: 'b@c.com', loginUrl: `${PROD_URL}/sign-in` }, branding),
  ]

  for (const html of samples) {
    assert.ok(html.includes('Support Hero'), 'expected Support Hero branding in email')
    assert.ok(!html.includes('SupportHub'), 'SupportHub must not appear in emails')
    assert.ok(!html.includes('localhost:3000'), 'localhost:3000 must never appear in emails')
    assert.ok(!html.includes('http://localhost'), 'localhost links must never appear in emails')
  }
})

test('email: buttons and links use the configured frontend URL', () => {
  const html = welcomeTemplate({ userEmail: 'a@b.com', loginUrl: `${PROD_URL}/sign-in` }, branding)
  assert.ok(html.includes(`href="${PROD_URL}/sign-in"`), 'login button must point at the configured frontend URL')
  assert.ok(!html.includes('supporthub.app'), 'no hardcoded portal domain')
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