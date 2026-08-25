import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()

export const projectsRouter = router

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getProjects } = await import('../controllers/project.controller')
    const result = await getProjects(req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { getProjectById } = await import('../controllers/project.controller')
    const result = await getProjectById(parseInt(req.params.id as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { createProject } = await import('../controllers/project.controller')
    const result = await createProject(req.body, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { updateProject } = await import('../controllers/project.controller')
    const result = await updateProject(parseInt(req.params.id as string), req.body, req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

router.post('/:id/archive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { archiveProject } = await import('../controllers/project.controller')
    const result = await archiveProject(parseInt(req.params.id as string), req.user!)
    return res.json(result)
  } catch (err: any) {
    return res.status(400).json({ error: err.message })
  }
})

