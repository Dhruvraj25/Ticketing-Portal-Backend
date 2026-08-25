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
import { getWebhookStatus, loadTeamsConfig, sendWebhookMessage } from '../services/teams/teams-webhook-client'
import { getQueueStats, getQueueEntries, clearQueue } from '../services/teams/teams-queue'
import { teamsMonitor } from '../services/teams/teams-monitor'
import { teamsConfigValidator } from '../services/teams/teams-config-validator'
import type { TeamsNotificationPayload } from '../services/teams/teams.types'

const router = Router()

// ─── Send Notification ─────────────────────────────────────────────────────

router.post('/notification', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventType, payload } = req.body
    if (!eventType || !payload) {
      return res.status(400).json({ error: 'Missing required fields: eventType, payload' })
    }

    // Respect the customer preference (defense-in-depth; the frontend also gates).
    // In-app and email notifications are unaffected — only Teams is skipped.
    const recipientUserId = (payload as TeamsNotificationPayload).recipientUserId
    if (recipientUserId) {
      try {
        const { db } = await import('../config/db')
        const { user } = await import('../models/schema')
        const { eq } = await import('drizzle-orm')
        const [recipient] = await db
          .select({ role: user.role, enableTeamsNotifications: user.enableTeamsNotifications })
          .from(user)
          .where(eq(user.id, recipientUserId))
          .limit(1)
        // Only customers (client accounts) are governed by the preference —
        // internal staff notifications always flow to Teams.
        if (recipient && recipient.role === 'client' && !recipient.enableTeamsNotifications) {
          console.log(TEAMS_LOG_PREFIX + ' Skipped notification for ' + recipientUserId + ' (customer Teams notifications disabled)')
          return res.json({ success: true, message: 'Teams notification skipped (customer preference)', skipped: true })
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

router.post('/test', async (_req: AuthenticatedRequest | any, res: Response) => {
  try {
    const config = loadTeamsConfig()
    const testPayload: TeamsNotificationPayload = {
      id: 'test_' + Date.now().toString(36),
      eventType: 'test_message',
      title: 'Teams Integration Test',
      message: 'This is a test message from SupportHub.',
      projectName: 'Test Project',
      ticketId: '#TEST-001',
      priority: 'Low',
      url: process.env.FRONTEND_URL || 'http://localhost:3000',
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

router.get('/status', (_req: AuthenticatedRequest | any, res: Response) => {
  const config = loadTeamsConfig()
  const webhookStatus = getWebhookStatus()
  const qStats = getQueueStats()
  const healthStatus = teamsMonitor.getHealthStatus(
    { enabled: config.enabled, webhookUrl: config.webhookUrl },
    qStats.currentDepth,
  )

  return res.json({
    ...healthStatus,
    webhookUrlPreview: webhookStatus.webhookUrlPreview,
  })
})

// ─── Configuration Validation ──────────────────────────────────────────────

router.get('/config/validate', (_req: AuthenticatedRequest | any, res: Response) => {
  const config = loadTeamsConfig()
  const validation = teamsConfigValidator.validateConfig(config)
  return res.json(validation)
})

// ─── Queue Status ──────────────────────────────────────────────────────────

router.get('/queue', (_req: AuthenticatedRequest | any, res: Response) => {
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

router.post('/queue/clear', (_req: AuthenticatedRequest | any, res: Response) => {
  clearQueue()
  return res.json({ success: true, message: 'Queue cleared' })
})

// ─── Monitor Events ────────────────────────────────────────────────────────

router.get('/monitor', (_req: AuthenticatedRequest | any, res: Response) => {
  const events = teamsMonitor.getRecentEvents(100)
  const stats = teamsMonitor.getStats()

  return res.json({
    stats,
    recentEvents: events,
    messageLog: teamsMonitor.getMessageLog().slice(-50),
  })
})

// ─── Reset Monitor Stats ───────────────────────────────────────────────────

router.post('/monitor/reset', (_req: AuthenticatedRequest | any, res: Response) => {
  teamsMonitor.resetStats()
  return res.json({ success: true, message: 'Monitor stats reset' })
})

export default router
