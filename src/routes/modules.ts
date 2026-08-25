import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()

export const modulesRouter = router

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getModules } = await import('../controllers/module.controller')
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined
    const result = await getModules(projectId, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getModuleById } = await import('../controllers/module.controller')
    const result = await getModuleById(parseInt(req.params.id as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { createModule } = await import('../controllers/module.controller')
    const result = await createModule(req.body, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { updateModule } = await import('../controllers/module.controller')
    const result = await updateModule(parseInt(req.params.id as string), req.body, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { deleteModule } = await import('../controllers/module.controller')
    await deleteModule(parseInt(req.params.id as string), req.user!)
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

