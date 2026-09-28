// ============================================================================
// Admin → Email Management API  (/api/email-admin/*)
// ============================================================================
// ADMIN ONLY (same rule as the Teams project-channel routes). Every response
// carries only safe values: provider name/status, sender address/name,
// verification state, and email_log metadata. Never tokens, client secrets,
// credentials or stored email bodies.
// ============================================================================

import { Router, Response, NextFunction, type RequestHandler } from 'express'
import { requireAuth, AuthenticatedRequest } from '../middleware/auth'
import { getActiveProviderName } from '../services/email/email.provider'
import { getQueue, getQueueDepth, sendNowLogged } from '../services/email/email.queue'
import {
  EMAIL_TEMPLATE_CATALOG,
  findCatalogEntry,
  getCodeTemplateDefinition,
  renderDraftPreview,
  renderTemplatePreview,
} from '../services/email/email-template-catalog'
import { refreshTemplateOverrides, TEMPLATE_LIMITS, validateTemplateInput } from '../services/email/email-template-overrides'
import {
  deleteEmailTemplateOverride,
  getEmailTemplateOverride,
  listEmailTemplateOverrides,
  upsertEmailTemplateOverride,
} from '../repositories/email-template.repository'
import { resolveSender } from '../services/email/email-sender-config'
import {
  checkGraphConnection,
  getEnvironmentSenderEmail,
  isGraphConfigured,
  verifyGraphSender,
} from '../services/email/providers/microsoft-graph.provider'
import { baseWrapper, emailHeading, emailParagraph, getBranding } from '../services/email/templates/base.template'
import { getEmailSettings, upsertEmailSettings } from '../repositories/email-settings.repository'
import {
  getEmailLogById,
  getEmailLogStats,
  getLastSubjectsByEvent,
  listEmailLogs,
  listEventTypesInLog,
} from '../repositories/email-log.repository'
import { normalizeEmail } from '../utils/email'

// Route handlers (no auth here). They are only ever mounted behind the admin
// guard by createEmailAdminRouter() below.
const routes = Router()

function requireAdminOnly(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied', code: 'ADMIN_REQUIRED' })
  }
  next()
}


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PROVIDER_LABELS: Record<string, string> = {
  'microsoft-graph': 'Microsoft Graph',
  'microsoft-smtp': 'Microsoft 365 SMTP',
  resend: 'Resend',
  console: 'Console (development — emails are only logged)',
}

function safeError(res: Response, err: unknown, label: string) {
  console.error(`[EmailAdmin] ${label}:`, err instanceof Error ? err.message : err)
  return res.status(500).json({ error: `Unable to ${label.toLowerCase()}.` })
}

function parseMetadata(raw: string | null): { ticketNumber?: string; projectName?: string; cc?: string[]; bcc?: string[] } {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function toLogDto(row: Awaited<ReturnType<typeof getEmailLogById>>) {
  if (!row) return null
  const meta = parseMetadata(row.metadata)
  return {
    id: row.id,
    eventType: row.eventType,
    recipient: row.recipientEmail,
    cc: meta.cc ?? [],
    subject: row.subject,
    ticketNumber: meta.ticketNumber ?? null,
    projectName: meta.projectName ?? null,
    status: row.status,
    fromAddress: row.fromAddress,
    attempts: row.retryCount,
    maxAttempts: row.maxRetries,
    error: row.errorMessage,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  }
}

/** Resolve the ?period= / ?from= / ?to= window. */
function periodRange(q: Record<string, unknown>): { from?: Date; to?: Date } {
  const now = new Date()
  switch (q.period) {
    case 'today': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      return { from: start, to: now }
    }
    case '7d':
      return { from: new Date(now.getTime() - 7 * 86_400_000), to: now }
    case '30d':
      return { from: new Date(now.getTime() - 30 * 86_400_000), to: now }
    case 'custom': {
      const from = typeof q.from === 'string' && q.from ? new Date(q.from) : undefined
      const to = typeof q.to === 'string' && q.to ? new Date(q.to) : undefined
      if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) to.setHours(23, 59, 59, 999)
      return {
        from: from && !isNaN(from.getTime()) ? from : undefined,
        to: to && !isNaN(to.getTime()) ? to : undefined,
      }
    }
    default:
      return {}
  }
}

// ─── Overview: KPIs ─────────────────────────────────────────────────────────
routes.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from, to } = periodRange(req.query)
    const s = await getEmailLogStats(from, to)
    const finished = s.sent + s.failed
    return res.json({
      period: req.query.period || 'all',
      total: s.total,
      // 'sent' = accepted by the provider (Graph returns 202; there is no
      // mailbox-delivery receipt).
      delivered: s.sent,
      failed: s.failed,
      pending: s.pending,
      // Microsoft Graph sendMail exposes no bounce signal — reported as unsupported.
      bounced: null,
      deliveryRate: finished > 0 ? Math.round((s.sent / finished) * 1000) / 10 : null,
      liveQueueDepth: getQueueDepth(),
    })
  } catch (err) {
    return safeError(res, err, 'Load email statistics')
  }
})

// ─── Provider status ────────────────────────────────────────────────────────
routes.get('/provider', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const name = getActiveProviderName()
    const settings = await getEmailSettings()
    const configured = name === 'microsoft-graph' ? isGraphConfigured() : name !== 'console'
    return res.json({
      provider: name,
      providerLabel: PROVIDER_LABELS[name] ?? name,
      configured,
      status: !configured ? 'disconnected' : settings?.providerStatus ?? 'unchecked',
      lastCheckedAt: settings?.providerLastCheckedAt ?? null,
      lastError: settings?.providerLastError ?? null,
    })
  } catch (err) {
    return safeError(res, err, 'Load provider status')
  }
})

routes.post('/provider/test', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const name = getActiveProviderName()
    if (name !== 'microsoft-graph') {
      return res.status(400).json({ error: `Connection testing is available for Microsoft Graph only (active provider: ${PROVIDER_LABELS[name] ?? name}).` })
    }
    const result = await checkGraphConnection()
    const now = new Date()
    await upsertEmailSettings({
      providerStatus: result.ok ? 'connected' : 'disconnected',
      providerLastCheckedAt: now,
      providerLastError: result.ok ? null : result.error ?? null,
    })
    return res.json({ status: result.ok ? 'connected' : 'disconnected', lastCheckedAt: now, error: result.error ?? null })
  } catch (err) {
    return safeError(res, err, 'Test the provider connection')
  }
})

// ─── Sender configuration ───────────────────────────────────────────────────
routes.get('/sender', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [active, settings] = await Promise.all([resolveSender(), getEmailSettings()])
    const provider = getActiveProviderName()
    const graphReady = provider === 'microsoft-graph' && isGraphConfigured()
    const status = !graphReady || !active.email
      ? 'disconnected'
      : active.source === 'database'
        ? 'verified'
        : 'verification_required'
    return res.json({
      senderEmail: active.email,
      senderName: active.name,
      source: active.source,
      environmentSenderEmail: getEnvironmentSenderEmail(),
      provider,
      providerLabel: PROVIDER_LABELS[provider] ?? provider,
      status,
      lastVerifiedAt: active.source === 'database' ? settings?.senderLastVerifiedAt ?? null : null,
      lastAttempt: settings?.lastVerificationAt
        ? {
            email: settings.lastVerificationEmail,
            at: settings.lastVerificationAt,
            error: settings.lastVerificationError,
          }
        : null,
    })
  } catch (err) {
    return safeError(res, err, 'Load sender configuration')
  }
})

/**
 * Save & Verify: the new sender only becomes ACTIVE after Microsoft Graph
 * accepts a verification message sent FROM that mailbox. A rejected mailbox is
 * recorded as a failed attempt; the current active sender is left unchanged.
 */
routes.put('/sender', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawEmail = typeof req.body?.senderEmail === 'string' ? req.body.senderEmail : ''
    const senderEmail = normalizeEmail(rawEmail)
    const senderName = typeof req.body?.senderName === 'string' ? req.body.senderName.trim() : ''

    if (!senderEmail || !EMAIL_RE.test(senderEmail) || senderEmail.length > 254) {
      return res.status(400).json({ error: 'Enter a valid sender email address.' })
    }
    if (senderName.length > 100) {
      return res.status(400).json({ error: 'Sender name must be 100 characters or fewer.' })
    }
    if (getActiveProviderName() !== 'microsoft-graph' || !isGraphConfigured()) {
      return res.status(400).json({ error: 'Microsoft Graph is not configured, so a sender cannot be verified.' })
    }

    const branding = getBranding()
    const verification = await verifyGraphSender(senderEmail, senderName || null, {
      subject: `${branding.companyName}: sender verification`,
      html: baseWrapper(
        emailHeading('Sender verification') +
          emailParagraph(`This mailbox was configured as the ${branding.companyName} sender in Email Management. No action is needed.`),
        branding,
      ),
    })
    const now = new Date()

    if (!verification.ok) {
      await upsertEmailSettings({
        lastVerificationEmail: senderEmail,
        lastVerificationAt: now,
        lastVerificationError: verification.error,
        updatedBy: req.user!.id,
      })
      return res.status(422).json({
        error: 'Unable to verify this sender email with Microsoft Graph.',
        reason: verification.error,
      })
    }

    await upsertEmailSettings({
      senderEmail,
      senderName: senderName || null,
      senderStatus: 'verified',
      senderLastVerifiedAt: now,
      lastVerificationEmail: senderEmail,
      lastVerificationAt: now,
      lastVerificationError: null,
      updatedBy: req.user!.id,
    })
    console.log(`[EmailAdmin] Sender verified and activated by ${req.user!.id}: ${senderEmail}`)
    return res.json({ success: true, senderEmail, senderName: senderName || null, status: 'verified', lastVerifiedAt: now })
  } catch (err) {
    return safeError(res, err, 'Save the sender configuration')
  }
})

// ─── Test email (current sender, existing provider) ─────────────────────────
routes.post('/test-email', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const to = normalizeEmail(typeof req.body?.to === 'string' ? req.body.to : '')
    if (!to || !EMAIL_RE.test(to)) {
      return res.status(400).json({ error: 'Enter a valid test recipient email address.' })
    }
    const branding = getBranding()
    const sender = await resolveSender()
    const result = await sendNowLogged({
      from: sender.email ?? '',
      to,
      subject: `${branding.companyName}: test email`,
      html: baseWrapper(
        emailHeading('Test email') +
          emailParagraph(`This is a test email from ${branding.companyName} Email Management. Your email delivery is working.`),
        branding,
      ),
      eventType: 'test_email',
    })
    return res.json(
      result.success
        ? { accepted: true, from: result.from ?? sender.email }
        : { accepted: false, error: result.error ?? 'The test email could not be sent.' },
    )
  } catch (err) {
    return safeError(res, err, 'Send the test email')
  }
})

// ─── Logs / queue / activity ────────────────────────────────────────────────
routes.get('/logs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { from, to } = periodRange({ ...req.query, period: 'custom' })
    const status = typeof req.query.status === 'string' && req.query.status !== 'all' ? req.query.status : undefined
    const statuses = status === 'pending' ? ['pending'] : undefined
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const page = Math.max(Number(req.query.page) || 1, 1)
    const { rows, total } = await listEmailLogs({
      status: statuses ? undefined : status,
      statuses,
      eventType: typeof req.query.eventType === 'string' && req.query.eventType !== 'all' ? req.query.eventType : undefined,
      search: typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search.trim().slice(0, 100) : undefined,
      from,
      to,
      limit,
      offset: (page - 1) * limit,
    })
    return res.json({ logs: rows.map((r) => toLogDto(r)), total, page, limit })
  } catch (err) {
    return safeError(res, err, 'Load email logs')
  }
})

routes.get('/logs/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid email id.' })
    const row = await getEmailLogById(id)
    if (!row) return res.status(404).json({ error: 'Email not found.' })
    return res.json(toLogDto(row))
  } catch (err) {
    return safeError(res, err, 'Load the email')
  }
})

routes.get('/queue', (_req: AuthenticatedRequest, res: Response) => {
  // Live in-memory queue of THIS backend instance (retries are automatic).
  const entries = getQueue().map((e) => ({
    id: e.id,
    eventType: e.eventType,
    recipient: Array.isArray(e.params.to) ? e.params.to.join(', ') : e.params.to,
    subject: e.params.subject,
    attempts: e.attempts ?? 0,
    maxRetries: e.maxRetries,
    createdAt: e.createdAt,
  }))
  return res.json({ depth: entries.length, entries })
})

routes.get('/event-types', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const inLog = await listEventTypesInLog()
    const all = new Set<string>([...EMAIL_TEMPLATE_CATALOG.map((e) => e.eventType), ...inLog])
    return res.json({ eventTypes: [...all].sort() })
  } catch (err) {
    return safeError(res, err, 'Load event types')
  }
})

// ─── Templates ──────────────────────────────────────────────────────────────
// Built-in code templates are the default; an admin may save a customized
// override per event (email_templates). Reset to Default deletes the override.
routes.get('/templates', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [lastSubjects, overrides] = await Promise.all([
      getLastSubjectsByEvent().catch(() => new Map()),
      listEmailTemplateOverrides(),
    ])
    const byEvent = new Map(overrides.map((o) => [o.eventType, o]))
    return res.json({
      editable: true,
      templates: EMAIL_TEMPLATE_CATALOG.map((e) => {
        const o = byEvent.get(e.eventType)
        return {
          eventType: e.eventType,
          label: o?.name || e.label,
          defaultLabel: e.label,
          recipient: e.recipient,
          status: !o ? 'default' : o.isActive ? 'customized' : 'customized_inactive',
          updatedAt: o?.updatedAt ?? null,
          lastSubject: lastSubjects.get(e.eventType)?.subject ?? null,
          lastSentAt: lastSubjects.get(e.eventType)?.createdAt ?? null,
        }
      }),
    })
  } catch (err) {
    return safeError(res, err, 'Load email templates')
  }
})

/** Editor payload: the saved override (if any), the code default, and the allowed variables. */
routes.get('/templates/:eventType', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventType = String(req.params.eventType)
    const entry = findCatalogEntry(eventType)
    if (!entry) return res.status(404).json({ error: 'Unknown email template.' })
    const def = getCodeTemplateDefinition(eventType)
    if (!def) return res.status(500).json({ error: 'Unable to load the default template.' })
    const o = await getEmailTemplateOverride(eventType)
    return res.json({
      eventType,
      label: entry.label,
      recipient: entry.recipient,
      status: !o ? 'default' : o.isActive ? 'customized' : 'customized_inactive',
      variables: def.variables,
      limits: TEMPLATE_LIMITS,
      default: { name: entry.label, subject: def.subject, htmlBody: def.htmlBody, textBody: null },
      customized: o
        ? { name: o.name, subject: o.subject, htmlBody: o.htmlBody, textBody: o.textBody, isActive: o.isActive, updatedAt: o.updatedAt }
        : null,
    })
  } catch (err) {
    return safeError(res, err, 'Load the email template')
  }
})

routes.put('/templates/:eventType', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventType = String(req.params.eventType)
    if (!findCatalogEntry(eventType)) return res.status(404).json({ error: 'Unknown email template.' })
    const def = getCodeTemplateDefinition(eventType)
    if (!def) return res.status(500).json({ error: 'Unable to load the default template.' })
    const result = validateTemplateInput(req.body ?? {}, def.variables)
    if (!result.ok) return res.status(400).json({ error: 'The template is not valid.', errors: result.errors })

    const row = await upsertEmailTemplateOverride({ eventType, ...result.value, updatedBy: req.user!.id })
    await refreshTemplateOverrides()
    // Audit: who/what/when only — never the template or email contents.
    console.log(`[EmailAdmin][Audit] template_edited event=${eventType} active=${row.isActive} by=${req.user!.id} at=${row.updatedAt.toISOString()}`)
    return res.json({ success: true, eventType, status: row.isActive ? 'customized' : 'customized_inactive', updatedAt: row.updatedAt })
  } catch (err) {
    return safeError(res, err, 'Save the email template')
  }
})

/** Reset to Default — removes the override; the built-in code template is used again. */
routes.delete('/templates/:eventType', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventType = String(req.params.eventType)
    if (!findCatalogEntry(eventType)) return res.status(404).json({ error: 'Unknown email template.' })
    const removed = await deleteEmailTemplateOverride(eventType)
    await refreshTemplateOverrides()
    console.log(`[EmailAdmin][Audit] template_reset event=${eventType} removed=${removed} by=${req.user!.id} at=${new Date().toISOString()}`)
    return res.json({ success: true, eventType, status: 'default', removed })
  } catch (err) {
    return safeError(res, err, 'Reset the email template')
  }
})

/** Preview an UNSAVED draft with sample data. Validates like Save; never sends or queues. */
routes.post('/templates/:eventType/preview', (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventType = String(req.params.eventType)
    if (!findCatalogEntry(eventType)) return res.status(404).json({ error: 'Unknown email template.' })
    const def = getCodeTemplateDefinition(eventType)
    if (!def) return res.status(500).json({ error: 'Unable to load the default template.' })
    const result = validateTemplateInput({ name: 'preview', ...(req.body ?? {}) }, def.variables)
    if (!result.ok) return res.status(400).json({ error: 'The template is not valid.', errors: result.errors })
    const preview = renderDraftPreview(eventType, result.value)
    return res.json(preview)
  } catch (err) {
    return safeError(res, err, 'Render the template preview')
  }
})

routes.get('/templates/:eventType/preview', (req: AuthenticatedRequest, res: Response) => {
  try {
    const eventType = String(req.params.eventType)
    const preview = renderTemplatePreview(eventType)
    if (!preview) return res.status(404).json({ error: 'Template not found.' })
    return res.json(preview)
  } catch (err) {
    return safeError(res, err, 'Render the template preview')
  }
})

/**
 * Every /api/email-admin route requires an authenticated ADMIN: authentication
 * (requireAuth by default) → requireAdminOnly → handlers. The authenticate
 * parameter exists only so tests can supply a session without Better Auth.
 */
export function createEmailAdminRouter(authenticate: RequestHandler = requireAuth as unknown as RequestHandler): Router {
  const router = Router()
  router.use(authenticate, requireAdminOnly as unknown as RequestHandler, routes)
  return router
}

export default createEmailAdminRouter()
