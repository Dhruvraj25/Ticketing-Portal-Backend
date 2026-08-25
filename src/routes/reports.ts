import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()

export const reportsRouter = router

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getReportData } = await import('../controllers/reports/index')
    const result = await getReportData(req.body, req.user! as { id: string; name: string; email: string; role: import('../types/index').UserRole })
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/form-data', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getReportFormData } = await import('../controllers/reports/index')
    const result = await getReportFormData(req.user! as { id: string; name: string; email: string; role: import('../types/index').UserRole })
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

