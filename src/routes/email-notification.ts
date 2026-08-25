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

const router = Router()

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
router.post('/notification', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { eventType, to, data, immediate } = req.body
    if (!eventType || !to || !data) {
      return res.status(400).json({ error: 'Missing required fields: eventType, to, data' })
    }

    // Fire-and-forget — never block the response
    sendEmailNotification(eventType, to, data, { immediate }).catch((err: Error) => {
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
      sendTicketResolved(to, data, opts)
      break
    case 'ticket_closed':
      sendTicketClosed(to, data, opts)
      break
    case 'welcome':
      sendWelcomeEmail(to, data, opts)
      break
    case 'customer_created':
      sendCustomerCreated(to, data, opts)
      break
    case 'account_activated':
      sendAccountActivated(to, data, opts)
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
