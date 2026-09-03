// ============================================================================
// Email Notification Route — Bridge for Frontend Server Actions
// ============================================================================
//
// This route provides a secure endpoint for frontend server actions to trigger
// email notifications via the backend email service. It follows the fire-and-forget
// pattern: the endpoint returns immediately after queueing, and the email service
// handles delivery asynchronously.
//
// Architecture:
//   Frontend Action (fire-and-forget) → POST /api/email/notification → Email Service → Queue
//
// This isolates email sending from business logic and prevents email failures
// from blocking the primary API response.
// ============================================================================

import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'
import {
  sendTicketCreated,
  sendTicketAssigned,
  sendEstimateApproved,
  sendEstimateRejected,
  sendAdditionalHours,
  sendAdditionalHoursRejected,
  sendTicketResolved,
  sendTicketClosed,
  sendTicketReopened,
  sendTicketReassigned,
  sendRevisionRequested,
  sendEstimateRequested,
  sendAdditionalHoursApproved,
  sendWelcomeEmail,
  sendCustomerCreated,
  sendAccountActivated,
  sendWalletLow,
  sendWalletEmpty,
  sendSupportHoursAdded,
  sendPasswordReset,
  sendPasswordResetRequested,
  sendNewProject,
  sendDeveloperStartedWork,
  sendDeveloperCompletedWork,
  sendRevisionApproved,
  sendRevisionRejected,
  sendSupportRenewalReminder,
  sendLoginCredentials,
} from '../services/email/email.service'
import { EMAIL_LOG_PREFIX } from '../services/email/email.constants'
import { getFrontendUrl } from '../utils/frontend-url'
import { indexPreferences } from '../lib/notification-preferences'

const router = Router()

const FRONTEND_URL = getFrontendUrl()

const LOGIN_URL = `${FRONTEND_URL}/sign-in`

// ─── Idempotency ──────────────────────────────────────────────────────────
// Prevents duplicate emails caused by retries or duplicate API submissions
// (e.g. the same approval action POSTed twice). Every DISTINCT approval/event
// carries its own key (or none) and is always sent — only exact repeats within
// the window are suppressed.
import { createWindowDedupe } from '../utils/window-dedupe'
const EMAIL_DEDUPE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const emailDedupe = createWindowDedupe(EMAIL_DEDUPE_WINDOW_MS)

function isDuplicateSubmission(key: string | undefined): boolean {
  return emailDedupe.isDuplicate(key)
}
/**
 * POST /api/email/notification
 *
 * Accepts a notification request and passes it to the appropriate email service method.
 * Always returns 200 immediately — email sending is handled asynchronously.
 *
 * Body:
 * {
 *   eventType: string
 *   to: string | string[]
 *   data: object
 *   immediate?: boolean
 * }
 */
router.post('/notification', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventType, to, data, immediate, idempotencyKey } = req.body
    if (!eventType || !to || !data) {
      return res.status(400).json({ error: 'Missing required fields: eventType, to, data' })
    }

    // Suppress exact duplicate submissions (retries) — every distinct event
    // passes through because it carries a distinct key or none at all. The
    // caller supplies an idempotencyKey per distinct approval/action cycle.
    if (isDuplicateSubmission(idempotencyKey)) {
      return res.json({ success: true, message: 'Duplicate email submission suppressed', deduplicated: true })
    }

    // Requirement #14 — enforce per-event Email preferences server-side. The
    // frontend is never trusted to enforce preferences: recipients who have
    // explicitly disabled this event on the Email channel are dropped here.
    const sendTo = await filterByEmailPreferences(to, eventType)
    if (sendTo.length === 0) {
      return res.json({ success: true, message: 'Email notification skipped (recipient preference)', skipped: true })
    }

    // Fire-and-forget — never block the response
    sendEmailNotification(eventType, sendTo, data, { immediate }).catch((err: Error) => {
      console.error(`${EMAIL_LOG_PREFIX} Notification send failed:`, err.message)
    })

    return res.json({ success: true, message: 'Email notification queued' })
  } catch (err: any) {
    // Never expose transport errors — log server-side only
    console.error(`${EMAIL_LOG_PREFIX} Notification route error:`, err.message)
    return res.json({ success: true, message: 'Email notification queued' })
  }
})

/**
 * Drop recipients who explicitly disabled this event on the Email channel.
 * Recipients are resolved server-side by normalized email — unknown addresses
 * (e.g. external contacts) are kept, defaults are always enabled.
 */
async function filterByEmailPreferences(to: string | string[], eventType: string): Promise<string | string[]> {
  const addresses = (Array.isArray(to) ? to : [to])
    .map((a) => typeof a === 'string' ? a.trim() : '')
    .filter(Boolean)
  if (addresses.length === 0) return []

  try {
    const { db } = await import('../config/db')
    const { user } = await import('../models/schema')
    const { sql } = await import('drizzle-orm')
    const { normalizeEmail } = await import('../utils/email')
    const {
      canonicalNotificationEvent,
      isNotificationEnabled,
    } = await import('../lib/notification-preferences')

    const canonical = canonicalNotificationEvent(eventType)
    if (!canonical) return addresses

    const normalized = addresses.map(a => normalizeEmail(a)).filter(Boolean)
    const prefRepoModule = await import('../repositories/notification-preference.repository')

    const matchedUsers = await db
      .select({ id: user.id, email: user.email, role: user.role, enableTeamsNotifications: user.enableTeamsNotifications })
      .from(user)
      .where(sql`LOWER(${user.email}) IN (${sql.join(normalized.map(e => sql`${e}`), ',')})`)

    const matched = new Map(matchedUsers.map(u => [u.email.toLowerCase(), u]))
    const prefIndex = await loadPrefIndex(matchedUsers.map(u => u.id), prefRepoModule)

    return addresses.filter(addr => {
      const u = matched.get(normalizeEmail(addr))
      if (!u) return true // not a portal user — keep (defaults apply)
      const rows = prefIndex.get(u.id)
      return isNotificationEnabled(rows, 'email', canonical, { role: u.role, enableTeamsNotifications: u.enableTeamsNotifications ?? false })
    })
  } catch (err) {
    // Preference filtering must never block delivery — fail open on lookup errors.
    console.warn(`${EMAIL_LOG_PREFIX} Preference filter failed — proceeding: ${err instanceof Error ? err.message : String(err)}`)
    return addresses
  }
}

async function loadPrefIndex(userIds: string[], prefRepo: any): Promise<Map<string, Map<string, boolean>>> {
  if (userIds.length === 0) return new Map()
  const rows = await prefRepo.findByUserIds([...new Set(userIds)])
  const map = new Map<string, Map<string, boolean>>()
  for (const id of new Set(userIds)) {
    const own = rows.filter((r: any) => r.userId === id)
    map.set(id, indexPreferences(own))
  }
  return map
}

/**
 * Route emails to the correct service method based on event type.
 * All methods fire asynchronously — errors are caught and logged.
 */
async function sendEmailNotification(
  eventType: string,
  to: string | string[],
  data: any,
  options?: { immediate?: boolean },
): Promise<void> {
  const opts = { immediate: options?.immediate ?? false }

  // ── Normalize ticket/wallet links to always use the configured FRONTEND_URL ──
  // Prevents frontend-constructed localhost URLs from reaching email templates.
  if (data.ticketLink) {
    data.ticketLink = data.ticketLink.replace(/^https?:\/\/[^\/]+/, FRONTEND_URL)
  }
  if (data.feedbackLink) {
    data.feedbackLink = data.feedbackLink.replace(/^https?:\/\/[^\/]+/, FRONTEND_URL)
  }
  if (data.walletLink) {
    data.walletLink = data.walletLink.replace(/^https?:\/\/[^\/]+/, FRONTEND_URL)
  }

  switch (eventType) {
    case 'ticket_created':
      sendTicketCreated(to, data, opts)
      break
    case 'ticket_assigned':
      sendTicketAssigned(to, data, opts)
      break
    case 'estimate_approved':
      sendEstimateApproved(to, data, opts)
      break
    case 'estimate_rejected':
      sendEstimateRejected(to, data, opts)
      break
    case 'additional_hours':
    case 'additional_hours_requested':
      sendAdditionalHours(to, data, opts)
      break
    case 'additional_hours_rejected':
      sendAdditionalHoursRejected(to, data, opts)
      break
    case 'ticket_resolved':
    case 'awaiting_client_review':
      sendTicketResolved(to, data, opts)
      break
    case 'ticket_closed':
      sendTicketClosed(to, data, opts)
      break
    case 'welcome':
      sendWelcomeEmail(to, data, opts)
      break
    case 'customer_created':
  sendCustomerCreated(
    to,
    {
      ...data,
      portalUrl: LOGIN_URL,
    },
    opts,
  )
  break

case 'account_activated':
  sendAccountActivated(
    to,
    {
      ...data,
      loginUrl: LOGIN_URL,
    },
    opts,
  )
  break
    case 'wallet_low':
      sendWalletLow(to, data, opts)
      break
    case 'ticket_reopened':
      sendTicketReopened(to, data, opts)
      break
    case 'ticket_reassigned':
      sendTicketReassigned(to, data, opts)
      break
    case 'ticket_revision_requested':
    case 'revision_requested':
      sendRevisionRequested(to, data, opts)
      break
    case 'estimate_requested':
      sendEstimateRequested(to, data, opts)
      break
    case 'additional_hours_approved':
      sendAdditionalHoursApproved(to, data, opts)
      break
    case 'wallet_empty':
      sendWalletEmpty(to, data, opts)
      break
    case 'support_hours_added':
    case 'support_hours_assigned':
      sendSupportHoursAdded(to, data, opts)
      break
    case 'password_reset':
      sendPasswordReset(to, data, opts)
      break
    case 'password_reset_requested':
      sendPasswordResetRequested(to, data, opts)
      break
    case 'new_project':
      sendNewProject(to, data, opts)
      break
    case 'developer_started_work':
      sendDeveloperStartedWork(to, data, opts)
      break
    case 'developer_completed_work':
      sendDeveloperCompletedWork(to, data, opts)
      break
    case 'revision_approved':
      sendRevisionApproved(to, data, opts)
      break
    case 'revision_rejected':
      sendRevisionRejected(to, data, opts)
      break
    case 'support_renewal_reminder':
      sendSupportRenewalReminder(to, data, opts)
      break
    case 'login_credentials':
      sendLoginCredentials(to, data, opts)
      break
    default:
      console.warn(`${EMAIL_LOG_PREFIX} Unknown event type: ${eventType}`)
  }
}

export default router
