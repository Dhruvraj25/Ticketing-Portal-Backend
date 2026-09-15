// ============================================================================
// Teams Notification Routes
// ============================================================================
// API endpoints for Teams integration.
// Provides routes for: sending notifications, checking status,
// sending test messages, viewing queue status, config validation.
// ============================================================================

import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'
import { sendTeamsNotification, sendTestMessage } from '../services/teams/teams.service'
import { testMessageCard } from '../services/teams/adaptive-cards'
import { TEAMS_LOG_PREFIX } from '../services/teams/teams.constants'
import { loadTeamsConfig, sendWebhookMessage } from '../services/teams/teams-webhook-client'
import { getQueueStats, getQueueEntries, clearQueue } from '../services/teams/teams-queue'
import { teamsMonitor } from '../services/teams/teams-monitor'
import { teamsConfigValidator, validateTeamsWebhookUrl } from '../services/teams/teams-config-validator'
import { resolveTeamsChannelForProject } from '../services/teams/teams-channel-resolver'
import type { TeamsNotificationPayload } from '../services/teams/teams.types'
import { getFrontendUrl } from '../utils/frontend-url'

const router = Router()

/** Only internal staff (admins / project managers) may reach Teams admin endpoints. */
function requireInternalStaff(req: AuthenticatedRequest, res: Response, next: any) {
  const role = req.user?.role
  if (role !== 'admin' && role !== 'project_manager') {
    return res.status(403).json({ error: 'Access denied' })
  }
  next()
}

/**
 * Project Teams channel configuration is ADMIN-only (Phase 7). Project managers
 * and below get an explicit 403 — they can never read or change a channel link.
 */
function requireAdminOnly(req: AuthenticatedRequest, res: Response, next: any) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied', code: 'ADMIN_REQUIRED' })
  }
  next()
}

// ─── Safe error logging ─────────────────────────────────────────────────────
// A webhook URL embeds an auth signature (a secret). Every log line for the
// project-channel routes is emitted through here, which only ever accepts a
// non-secret code plus scalar context — never a URL, token or response body.
function logChannelError(code: string, context: Record<string, unknown> = {}): void {
  console.error(TEAMS_LOG_PREFIX + ' project-channel error code=' + code + ' ' + JSON.stringify(context))
}

/**
 * Resolve the project a frontend-originated notification belongs to, so it can
 * be routed to that project's Teams channel. Precedence:
 *   1. Explicit payload.projectId
 *   2. The ticket named by payload.ticketNumber (ticketNumber is UNIQUE)
 *   3. payload.projectName, only when it matches exactly one project
 * Returns undefined when the project cannot be determined unambiguously — the
 * resolver then falls back to the global webhook (never to a wrong project).
 */
async function resolveProjectIdFromPayload(payload: TeamsNotificationPayload): Promise<number | undefined> {
  if (typeof payload.projectId === 'number' && Number.isFinite(payload.projectId)) {
    return payload.projectId
  }

  const rawTicketNumber = (payload as unknown as Record<string, unknown>).ticketNumber
  const projectName = payload.projectName
  if (!rawTicketNumber && !projectName) return undefined

  try {
    const { db } = await import('../config/db')
    const { ticket, project } = await import('../models/schema')
    const { eq, sql } = await import('drizzle-orm')

    if (rawTicketNumber) {
      const [t] = await db
        .select({ projectId: ticket.projectId })
        .from(ticket)
        .where(eq(ticket.ticketNumber, String(rawTicketNumber)))
        .limit(1)
      if (t?.projectId) return t.projectId
    }

    if (projectName) {
      const rows = await db
        .select({ id: project.id })
        .from(project)
        .where(sql`LOWER(${project.projectName}) = ${projectName.toLowerCase()}`)
        .limit(2)
      if (rows.length === 1) return rows[0].id
    }
  } catch (err) {
    // Fail safe: no routing assumption is made when the lookup fails.
    console.warn(
      TEAMS_LOG_PREFIX + ' Could not resolve notification project for routing: ' +
      (err instanceof Error ? err.message : String(err)),
    )
  }
  return undefined
}

// ─── Send Notification ─────────────────────────────────────────────────────
// Requires an authenticated user (the frontend server action sends the session
// cookie). Recipient preferences are enforced server-side below.

router.post('/notification', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventType, payload } = req.body
    if (!eventType || !payload) {
      return res.status(400).json({ error: 'Missing required fields: eventType, payload' })
    }

    // Requirement #14 — enforce the recipient's per-event Teams preference
    // server-side (the frontend is never trusted to enforce preferences).
    // The Teams default for client users is the customer-level
    // enable_teams_notifications flag; internal staff default to enabled.
    // Only messages addressed to a known recipient are gated — broadcast
    // channel messages without a recipient pass through.
    const teamsPayload = payload as TeamsNotificationPayload

    // Per-project channel routing: resolve the project (explicit id, ticket
    // number, or unique project name) BEFORE dispatch so the notification is
    // delivered to that project's Teams channel.
    try {
      teamsPayload.projectId = teamsPayload.projectId ?? await resolveProjectIdFromPayload(teamsPayload)
    } catch {
      // resolveProjectIdFromPayload already fails safe; never block dispatch.
    }

    const recipientUserId = teamsPayload.recipientUserId
    const recipientEmail = teamsPayload.recipientEmail
    if (recipientUserId || recipientEmail) {
      try {
        const { db } = await import('../config/db')
        const { user } = await import('../models/schema')
        const { eq, sql } = await import('drizzle-orm')
        const { canonicalNotificationEvent, isNotificationEnabled, indexPreferences } = await import('../lib/notification-preferences')
        const prefRepoModule = await import('../repositories/notification-preference.repository')
        const { normalizeEmail } = await import('../utils/email')

        const [recipient] = recipientUserId
          ? await db.select({ id: user.id, role: user.role, enableTeamsNotifications: user.enableTeamsNotifications, accountId: user.accountId })
            .from(user).where(eq(user.id, recipientUserId)).limit(1)
          : await db.select({ id: user.id, role: user.role, enableTeamsNotifications: user.enableTeamsNotifications, accountId: user.accountId })
            .from(user).where(sql`LOWER(${user.email}) = ${normalizeEmail(recipientEmail || '')}`).limit(1)

        if (recipient) {
          const canonical = canonicalNotificationEvent(eventType)
          const prefUser = {
            role: recipient.role,
            enableTeamsNotifications: recipient.enableTeamsNotifications ?? false,
          }

          let enabled: boolean
          if (teamsPayload.projectId) {
            // PROJECT-wise (authoritative for every recipient): the project's
            // preferences govern this event; legacy client rows are only an
            // inheritance fallback. Same preference source as Email.
            const { loadMergedPreferenceMapForProject } = await import('../services/notification-preference.service')
            const merged = canonical ? await loadMergedPreferenceMapForProject(teamsPayload.projectId) : new Map<string, boolean>()
            enabled = isNotificationEnabled(merged, 'teams', canonical || eventType, prefUser)
            console.log(
              '[NotificationPreference] projectId=' + teamsPayload.projectId + ' event=' + (canonical || eventType) +
              ' enabled=' + enabled + ' channel=teams',
            )
          } else {
            // Account-level event (no project) — legacy per-client / per-user.
            let rows: any[] = []
            if (recipient.role === 'client' && recipient.accountId) {
              rows = canonical ? (await prefRepoModule.findByClientId(recipient.accountId)) : []
            } else {
              rows = canonical ? (await prefRepoModule.findByUserId(recipient.id)) : []
            }
            const indexed = indexPreferences(rows)
            enabled = isNotificationEnabled(indexed, 'teams', canonical || eventType, prefUser)
          }

          if (!enabled) {
            console.log(TEAMS_LOG_PREFIX + ' Skipped notification for ' + recipient.id + ' (Teams preference disabled for event: ' + eventType + ')')
            return res.json({ success: true, message: 'Teams notification skipped (recipient preference)', skipped: true })
          }
        }
      } catch (dbErr) {
        // Fail-open: if the preference lookup fails, let the webhook attempt proceed.
        console.warn(TEAMS_LOG_PREFIX + ' Preference check failed — proceeding: ' + (dbErr instanceof Error ? dbErr.message : String(dbErr)))
      }
    }

    sendTeamsNotification(eventType, payload as TeamsNotificationPayload)

    return res.json({ success: true, message: 'Teams notification dispatched' })
  } catch (err: any) {
    console.error(TEAMS_LOG_PREFIX + ' Route error:', err.message)
    return res.json({ success: true, message: 'Teams notification dispatched' })
  }
})

// ─── Test Message ──────────────────────────────────────────────────────────

router.post('/test', requireAuth, requireInternalStaff, async (_req: AuthenticatedRequest | any, res: Response) => {
  try {
    const config = loadTeamsConfig()
    const testPayload: TeamsNotificationPayload = {
      id: 'test_' + Date.now().toString(36),
      eventType: 'test_message',
      title: 'Teams Integration Test',
      message: 'This is a test message from Support Hero.',
      projectName: 'Test Project',
      ticketId: '#TEST-001',
      priority: 'Low',
      url: getFrontendUrl(),
      color: 'info',
      fields: [
        { label: 'Test Type', value: 'Connectivity Test' },
        { label: 'Environment', value: process.env.NODE_ENV || 'development' },
        { label: 'Timestamp', value: new Date().toISOString() },
      ],
    }

    if (config.enabled) {
      // Live mode — call webhook directly for real-time test feedback
      const testCard = testMessageCard(testPayload)

      const result = await sendWebhookMessage(
        config,
        '',
        '',
        testCard as unknown as Record<string, unknown>,
      )

      if (result.success) {
        teamsMonitor.recordTestResult(true, 'Test message sent successfully via webhook', result.durationMs)
        return res.json({
          success: true,
          message: 'Webhook message sent successfully',
          statusCode: result.statusCode,
          responseBody: result.responseBody,
          messageId: result.messageId,
          durationMs: result.durationMs,
          mockMode: false,
          timestamp: new Date().toISOString(),
        })
      }

      // Webhook returned a non-success response
      teamsMonitor.recordTestResult(false, result.error || 'Webhook error')
      return res.status(200).json({
        success: false,
        message: 'Webhook returned error',
        statusCode: result.statusCode,
        responseBody: result.responseBody,
        error: result.error,
        durationMs: result.durationMs,
        mockMode: false,
        timestamp: new Date().toISOString(),
      })
    }

    // Mock mode — use existing fire-and-forget flow
    const startTime = Date.now()
    sendTestMessage(testPayload)
    const duration = Date.now() - startTime

    teamsMonitor.recordTestResult(true, 'Mock test message sent (' + duration + 'ms)', duration)

    return res.json({
      success: true,
      message: 'Mock message sent',
      durationMs: duration,
      mockMode: true,
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error(TEAMS_LOG_PREFIX + ' Test route error:', err.message)
    teamsMonitor.recordTestResult(false, err.message)
    return res.status(200).json({ success: false, message: 'Test failed: ' + err.message })
  }
})

// ─── Status / Health ───────────────────────────────────────────────────────

router.get('/status', requireAuth, requireInternalStaff, (_req: AuthenticatedRequest | any, res: Response) => {
  const config = loadTeamsConfig()
  const qStats = getQueueStats()
  const healthStatus = teamsMonitor.getHealthStatus(
    { enabled: config.enabled, webhookUrl: config.webhookUrl },
    qStats.currentDepth,
  )

  return res.json(healthStatus)
})

// ─── Configuration Validation ──────────────────────────────────────────────

router.get('/config/validate', requireAuth, requireInternalStaff, (_req: AuthenticatedRequest | any, res: Response) => {
  const config = loadTeamsConfig()
  const validation = teamsConfigValidator.validateConfig(config)
  return res.json(validation)
})

// ─── Queue Status ──────────────────────────────────────────────────────────

router.get('/queue', requireAuth, requireInternalStaff, (_req: AuthenticatedRequest | any, res: Response) => {
  const qStats = getQueueStats()
  const entries = getQueueEntries()

  return res.json({
    stats: qStats,
    entries: entries.map(function (e) {
      return {
        id: e.id,
        eventType: e.eventType,
        retryCount: e.retryCount,
        maxRetries: e.maxRetries,
        createdAt: e.createdAt,
        lastError: e.lastError || null,
      }
    }),
  })
})

// ─── Clear Queue ───────────────────────────────────────────────────────────

router.post('/queue/clear', requireAuth, requireInternalStaff, (_req: AuthenticatedRequest | any, res: Response) => {
  clearQueue()
  return res.json({ success: true, message: 'Queue cleared' })
})

// ─── Monitor Events ────────────────────────────────────────────────────────

router.get('/monitor', requireAuth, requireInternalStaff, (_req: AuthenticatedRequest | any, res: Response) => {
  const events = teamsMonitor.getRecentEvents(100)
  const stats = teamsMonitor.getStats()

  return res.json({
    stats,
    recentEvents: events,
    messageLog: teamsMonitor.getMessageLog().slice(-50),
  })
})

// ─── Reset Monitor Stats ───────────────────────────────────────────────────

router.post('/monitor/reset', requireAuth, requireInternalStaff, (_req: AuthenticatedRequest | any, res: Response) => {
  teamsMonitor.resetStats()
  return res.json({ success: true, message: 'Monitor stats reset' })
})

// ─── Project Teams Channels (Phase 7) ──────────────────────────────────────
// Admin-only. Every response is SECRET-FREE: the configured webhook URL is
// never returned, only its status (configured / enabled / updatedAt).

/** List every project with its Teams channel status (never the link). */
router.get('/projects', requireAuth, requireAdminOnly, async (_req: AuthenticatedRequest | any, res: Response) => {
  try {
    const repo = await import('../repositories/project-teams-channel.repository')
    const rows = await repo.listWithProjects()
    return res.json({
      projects: rows.map(function (r) {
        return {
          projectId: r.projectId,
          projectName: r.projectName,
          projectCode: r.projectCode,
          projectStatus: r.projectStatus,
          configured: !!r.configured,
          enabled: !!r.configured && !!r.enabled,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        }
      }),
    })
  } catch (err) {
    logChannelError('LIST_FAILED', { message: err instanceof Error ? err.message : 'unknown' })
    return res.status(500).json({ error: 'Could not load project Teams channels.', code: 'TEAMS_CHANNEL_LIST_FAILED' })
  }
})

/**
 * Create or update a project's Teams channel.
 * Body: { webhookUrl?: string, enabled?: boolean }
 *  - On create, webhookUrl is required.
 *  - On edit, omitting webhookUrl keeps the stored link (enabled toggle only).
 * The stored link is never echoed back.
 */
router.put('/projects/:projectId/channel', requireAuth, requireAdminOnly, async (req: AuthenticatedRequest | any, res: Response) => {
  const projectId = Number.parseInt(String(req.params.projectId), 10)
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ error: 'Invalid project id.', code: 'INVALID_PROJECT_ID' })
  }

  const body = (req.body || {}) as { webhookUrl?: unknown; enabled?: unknown }
  const linkProvided = typeof body.webhookUrl === 'string' && body.webhookUrl.trim().length > 0
  const wantsEnabled = body.enabled === undefined ? true : body.enabled === true

  try {
    const { db } = await import('../config/db')
    const { project } = await import('../models/schema')
    const { eq } = await import('drizzle-orm')

    const [projectRow] = await db
      .select({ id: project.id, projectName: project.projectName })
      .from(project)
      .where(eq(project.id, projectId))
      .limit(1)
    if (!projectRow) {
      return res.status(404).json({ error: 'Project not found.', code: 'PROJECT_NOT_FOUND' })
    }

    const repo = await import('../repositories/project-teams-channel.repository')
    const existing = await repo.findByProjectId(projectId)

    if (!existing && !linkProvided) {
      return res.status(400).json({
        error: 'A Microsoft Teams channel link is required.',
        code: 'TEAMS_CHANNEL_LINK_REQUIRED',
      })
    }

    let nextUrl = existing?.webhookUrl
    if (linkProvided) {
      const validation = validateTeamsWebhookUrl(body.webhookUrl as string)
      if (!validation.valid) {
        // Safe technical log — the message never contains the pasted link.
        logChannelError('INVALID_LINK', { projectId, reason: validation.message })
        return res.status(400).json({ error: validation.message, code: 'INVALID_TEAMS_CHANNEL_LINK' })
      }
      nextUrl = (body.webhookUrl as string).trim()
    }

    const saved = await repo.upsert(projectId, {
      webhookUrl: nextUrl as string,
      enabled: wantsEnabled,
      configuredBy: req.user?.id ?? null,
    })

    return res.json({
      success: true,
      projectId,
      configured: true,
      enabled: !!saved.enabled,
      updatedAt: saved.updatedAt ? new Date(saved.updatedAt).toISOString() : new Date().toISOString(),
      message: saved.enabled ? 'Teams channel saved.' : 'Teams channel saved and disabled.',
    })
  } catch (err) {
    logChannelError('SAVE_FAILED', { projectId, message: err instanceof Error ? err.message : 'unknown' })
    return res.status(500).json({ error: 'Could not save the Teams channel configuration.', code: 'TEAMS_CHANNEL_SAVE_FAILED' })
  }
})

/** Remove a project's Teams channel configuration. */
router.delete('/projects/:projectId/channel', requireAuth, requireAdminOnly, async (req: AuthenticatedRequest | any, res: Response) => {
  const projectId = Number.parseInt(String(req.params.projectId), 10)
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ error: 'Invalid project id.', code: 'INVALID_PROJECT_ID' })
  }

  try {
    const repo = await import('../repositories/project-teams-channel.repository')
    const removed = await repo.remove(projectId)
    if (!removed) {
      return res.status(404).json({
        error: 'No Microsoft Teams channel is configured for this project.',
        code: 'TEAMS_CHANNEL_NOT_CONFIGURED',
      })
    }
    return res.json({ success: true, projectId, configured: false, enabled: false, message: 'Teams channel removed.' })
  } catch (err) {
    logChannelError('REMOVE_FAILED', { projectId, message: err instanceof Error ? err.message : 'unknown' })
    return res.status(500).json({ error: 'Could not remove the Teams channel configuration.', code: 'TEAMS_CHANNEL_REMOVE_FAILED' })
  }
})

/** Send a test message to a specific project's configured channel. */
router.post('/projects/:projectId/test', requireAuth, requireAdminOnly, async (req: AuthenticatedRequest | any, res: Response) => {
  const projectId = Number.parseInt(String(req.params.projectId), 10)
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid project id.', code: 'INVALID_PROJECT_ID' })
  }

  try {
    const resolved = await resolveTeamsChannelForProject({ projectId })
    if (!resolved.enabled || !resolved.webhookUrl) {
      const message = resolved.reason === 'project_channel_disabled'
        ? 'The Microsoft Teams channel for this project is disabled.'
        : 'No Microsoft Teams channel is configured for this project.'
      return res.status(400).json({
        success: false,
        projectId,
        routing: resolved.source,
        error: message,
        code: 'TEAMS_CHANNEL_NOT_CONFIGURED',
      })
    }

    const testPayload: TeamsNotificationPayload = {
      id: 'test_' + Date.now().toString(36),
      eventType: 'test_message',
      title: 'Teams Project Channel Test',
      message: 'This is a test message for the project Teams channel.',
      url: getFrontendUrl(),
      color: 'info',
      projectId,
      fields: [
        { label: 'Test Type', value: 'Project Channel Test' },
        { label: 'Environment', value: process.env.NODE_ENV || 'development' },
        { label: 'Timestamp', value: new Date().toISOString() },
      ],
    }

    const card = testMessageCard(testPayload)
    const result = await sendWebhookMessage(
      { webhookUrl: resolved.webhookUrl, enabled: true, mockMode: false },
      '',
      '',
      card as unknown as Record<string, unknown>,
      null,
    )

    teamsMonitor.recordTestResult(
      result.success,
      result.success ? 'Project channel test sent' : 'Project channel test failed',
      result.durationMs,
    )

    if (!result.success) {
      logChannelError('TEST_DELIVERY_FAILED', {
        projectId,
        statusCode: result.statusCode ?? 0,
        message: result.error || 'unknown',
      })
    }

    return res.json({
      success: result.success,
      projectId,
      routing: resolved.source,
      statusCode: result.statusCode,
      messageId: result.messageId,
      durationMs: result.durationMs,
      mockMode: false,
      message: result.success ? 'Test message delivered to the project Teams channel.' : 'The Teams webhook rejected the test message.',
      // Sanitized only — never the webhook URL, signature or raw response body.
      error: result.success ? undefined : 'The Teams webhook rejected the test message. Verify the channel link and its permissions.',
    })
  } catch (err) {
    logChannelError('TEST_FAILED', { projectId, message: err instanceof Error ? err.message : 'unknown' })
    return res.status(500).json({
      success: false,
      projectId,
      error: 'Could not send the test message. Please try again.',
      code: 'TEAMS_CHANNEL_TEST_FAILED',
    })
  }
})

export default router
