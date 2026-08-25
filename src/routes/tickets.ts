import { Router, Response } from 'express'
import { db } from '../config/db'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()

export const ticketsRouter = router

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getTickets } = await import('../controllers/ticket.controller')
    const result = await getTickets(req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getTicketById } = await import('../controllers/ticket.controller')
    const result = await getTicketById(parseInt(req.params.id as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { createTicket } = await import('../controllers/ticket.controller')
    const result = await createTicket(req.body, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.patch('/:id/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { updateTicketStatus } = await import('../controllers/ticket.controller')
    await updateTicketStatus(parseInt(req.params.id as string), req.body.status, req.user!)
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/:id/assign', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { assignTicket } = await import('../controllers/ticket.controller')
    await assignTicket(parseInt(req.params.id as string), req.body.developerId, req.user!)
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { addComment } = await import('../controllers/ticket.controller')
    const result = await addComment(parseInt(req.params.id as string), req.body.content, req.body.isInternal, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getComments } = await import('../controllers/ticket.controller')
    const result = await getComments(parseInt(req.params.id as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/:id/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getTicketHistory } = await import('../controllers/ticket.controller')
    const result = await getTicketHistory(parseInt(req.params.id as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/:id/timer/start', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startTimer } = await import('../controllers/ticket.controller')
    const result = await startTimer(parseInt(req.params.id as string), req.body.description, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/timer/:timeLogId/stop', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { stopTimer } = await import('../controllers/ticket.controller')
    const result = await stopTimer(parseInt(req.params.timeLogId as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/timer/:timeLogId/pause', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { pauseTimer } = await import('../controllers/ticket.controller')
    const result = await pauseTimer(parseInt(req.params.timeLogId as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/timer/:timeLogId/resume', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { resumeTimer } = await import('../controllers/ticket.controller')
    const result = await resumeTimer(parseInt(req.params.timeLogId as string), req.body.ticketId, req.body.description, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

