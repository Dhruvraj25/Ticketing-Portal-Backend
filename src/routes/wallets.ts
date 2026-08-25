import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()

export const walletsRouter = router

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getWallets } = await import('../controllers/wallet.controller')
    const result = await getWallets(req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getWalletDashboardStats } = await import('../controllers/wallet.controller')
    const result = await getWalletDashboardStats(req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/low-balance', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getLowBalanceWallets } = await import('../controllers/wallet.controller')
    const threshold = parseInt(req.query.threshold as string) || 20
    const result = await getLowBalanceWallets(threshold, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/alerts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getActiveWalletAlerts } = await import('../controllers/wallet.controller')
    const result = await getActiveWalletAlerts(req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/:id/add-hours', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { addWalletHours } = await import('../controllers/wallet.controller')
    const result = await addWalletHours({ ...req.body, walletId: parseInt(req.params.id as string) }, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getWalletById } = await import('../controllers/wallet.controller')
    const result = await getWalletById(parseInt(req.params.id as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/:id/transactions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getWalletTransactions } = await import('../controllers/wallet.controller')
    const result = await getWalletTransactions(parseInt(req.params.id as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/:id/consumption', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getWalletTicketConsumption } = await import('../controllers/wallet.controller')
    const result = await getWalletTicketConsumption(parseInt(req.params.id as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

