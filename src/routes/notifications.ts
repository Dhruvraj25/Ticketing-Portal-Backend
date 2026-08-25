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

