import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()

export const attachmentsRouter = router

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { saveAttachment } = await import('../controllers/attachment.controller')
    const result = await saveAttachment(req.body, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/ticket/:ticketId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getAttachments } = await import('../controllers/attachment.controller')
    const result = await getAttachments(parseInt(req.params.ticketId as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { deleteAttachment } = await import('../controllers/attachment.controller')
    await deleteAttachment(parseInt(req.params.id as string), req.user!)
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

