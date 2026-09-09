import { test } from 'node:test'
import assert from 'node:assert/strict'
import { welcomeTemplate } from '../src/services/email/templates/welcome'
import { ticketCreatedTemplate } from '../src/services/email/templates/ticket-created'
import { passwordResetTemplate } from '../src/services/email/templates/password-reset'
import { ticketResolvedTemplate } from '../src/services/email/templates/ticket-resolved'
import { ticketAssignedTemplate } from '../src/services/email/templates/ticket-assigned'
import { revisionApprovedTemplate } from '../src/services/email/templates/revision-approved'
import { developerStartedWorkTemplate } from '../src/services/email/templates/developer-started-work'
import { developerCompletedWorkTemplate } from '../src/services/email/templates/developer-completed-work'
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

test('email: templates use Support Hero branding, never Support Hub/SupportHub', () => {
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
    assert.ok(!html.includes('Support Hub'), 'Support Hub must not appear in emails')
    assert.ok(!html.includes('SupportHub'), 'SupportHub must not appear in emails')
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
  assert.ok(!html.includes('Support Hub') && !html.includes('SupportHub'))
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
  assert.ok(!html.includes('Support Hub') && !html.includes('SupportHub'))
  assert.ok(!html.includes('localhost'))
  // This template is developer-facing only — it must never claim to be from
  // or addressed to the client, or reference client-approval language.
  assert.ok(!html.toLowerCase().includes('client approval'))
})

// ─── Client privacy — audit fix regression ─────────────────────────────────
// These templates are shared between an internal recipient (developer/
// manager) and a client recipient. The caller (Frontend server actions) omits
// the internal actor's name from the CLIENT copy's templateData; the template
// itself must render safely — no leaked name, no confusing fallback text —
// when that field is genuinely absent.

test('privacy: ticket-assigned client copy (no developerName) never renders a developer identity', () => {
  const html = ticketAssignedTemplate(
    { ticketNumber: 'TKT-10', ticketTitle: 'Bug', clientName: 'Acme Corp', priority: 'high', ticketLink: `${PROD_URL}/dashboard/tickets/10` } as any,
    branding,
  )
  assert.ok(!html.includes('Dana Dev'))
  // Fallback copy must be audience-neutral, never "assigned to you" (which
  // would wrongly imply the CLIENT was assigned).
  assert.ok(!html.includes('assigned to you'))
  assert.ok(html.includes('a developer on our support team'))
})

test('privacy: ticket-assigned developer copy (with developerName) is unaffected by the client-safe fallback', () => {
  const html = ticketAssignedTemplate(
    { ticketNumber: 'TKT-11', ticketTitle: 'Bug', clientName: 'Acme Corp', developerName: 'Dana Dev', priority: 'high', ticketLink: `${PROD_URL}/dashboard/tickets/11` },
    branding,
  )
  assert.ok(html.includes('Dana Dev'), 'developer recipient must still see the real developer name')
})

test('privacy: ticket-resolved client copy (no resolvedBy) never renders a manager identity', () => {
  const html = ticketResolvedTemplate(
    { ticketNumber: 'TKT-12', ticketTitle: 'Bug', ticketLink: `${PROD_URL}/dashboard/tickets/12` } as any,
    branding,
  )
  assert.ok(!html.includes('Mary Manager'))
  assert.ok(!html.includes('Resolved By'))
  assert.ok(html.includes('has been resolved and is ready for your review'))
})

test('privacy: revision-approved client copy (no approvedBy) never renders a manager identity', () => {
  const html = revisionApprovedTemplate(
    { ticketNumber: 'TKT-13', ticketTitle: 'Bug', revisionNumber: 2, ticketLink: `${PROD_URL}/dashboard/tickets/13` } as any,
    branding,
  )
  assert.ok(!html.includes('Mary Manager'))
  assert.ok(html.includes('has been approved.'))
})

test('privacy: revision-approved developer copy (with approvedBy) is unaffected', () => {
  const html = revisionApprovedTemplate(
    { ticketNumber: 'TKT-14', ticketTitle: 'Bug', revisionNumber: 2, approvedBy: 'Mary Manager', ticketLink: `${PROD_URL}/dashboard/tickets/14` },
    branding,
  )
  assert.ok(html.includes('Mary Manager'))
})

test('privacy: developer-started-work / developer-completed-work client copies (no developerName) never render a developer identity', () => {
  const started = developerStartedWorkTemplate(
    { ticketNumber: 'TKT-15', ticketTitle: 'Bug', ticketLink: `${PROD_URL}/dashboard/tickets/15` },
    branding,
  )
  const completed = developerCompletedWorkTemplate(
    { ticketNumber: 'TKT-16', ticketTitle: 'Bug', durationMinutes: 30, ticketLink: `${PROD_URL}/dashboard/tickets/16` },
    branding,
  )
  assert.ok(!started.includes('Dana Dev') && !started.includes('Developer:'))
  assert.ok(!completed.includes('Dana Dev') && !completed.includes('Developer:'))
})