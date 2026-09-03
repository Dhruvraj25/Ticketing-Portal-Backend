import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()

export const notificationsRouter = router

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getNotifications } = await import('../controllers/notification.controller')
    const result = await getNotifications(req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/unread-count', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getUnreadCount } = await import('../controllers/notification.controller')
    const result = await getUnreadCount(req.user!)
    return res.json({ count: result })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── Notification Preferences (Requirement #14) ──────────────────────────
// GET /api/notifications/preferences
//   Returns the authenticated user's effective per-event settings for the
//   in_app / email / teams channels (explicit rows + defaults).
// PUT /api/notifications/preferences
//   Body: { preferences: [{ eventType, channel, enabled }] }
//   Persists the user's OWN toggles. eventType may be a canonical key or any
//   alias of one; channel is one of in_app | email | teams.
router.get('/preferences', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getNotificationPreferences } = await import('../controllers/notification.controller')
    const result = await getNotificationPreferences(req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.put('/preferences', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { updateNotificationPreferences } = await import('../controllers/notification.controller')
    const result = await updateNotificationPreferences(req.user!, req.body)
    return res.json(result)
  } catch (err: any) {
    const status = err.statusCode && Number(err.statusCode) >= 400 && Number(err.statusCode) < 500 ? Number(err.statusCode) : 400
    return res.status(status).json({ error: err.message })
  }
})

router.patch('/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { markAsRead } = await import('../controllers/notification.controller')
    await markAsRead(parseInt(req.params.id as string), req.user!)
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.patch('/mark-all-read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { markAllAsRead } = await import('../controllers/notification.controller')
    await markAllAsRead(req.user!)
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

// ─── Create In-App Notification ──────────────────────────────────────────
// Persists an in-app notification (paired with the email bridge for the same
// event). The backend never trusts the target user silently — the recipient
// must be a real user.
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { db } = await import('../config/db')
    const { user } = await import('../models/schema')
    const { eq } = await import('drizzle-orm')
    const { userId, title, message, link, ticketId, eventType } = req.body
    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'userId, title and message are required' })
    }
    const [recipient] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1)
    if (!recipient) {
      return res.status(400).json({ error: 'Recipient user not found' })
    }
    const { createNotification } = await import('../services/notification.service')
    // eventType is optional but when present the recipient's per-event In-App
    // preference is enforced server-side (Requirement #14).
    const created = await createNotification({ userId, title, message, link, ticketId, eventType })
    return res.json({ success: true, skipped: created === false })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

