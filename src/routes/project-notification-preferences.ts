// ============================================================================
// Project Notification Preferences Routes
// ============================================================================
// Admin and Project Manager users manage notification preferences PER PROJECT.
// These preferences are authoritative and apply to every recipient of an event
// tied to the project (internal staff included). The legacy client table is
// retained only as an inheritance fallback while a project has no explicit row.
//
// GET    /api/projects/:projectId/notification-preferences
// PUT    /api/projects/:projectId/notification-preferences
//
// Authorization (enforced HERE, never only in the UI):
//   - Admin           → any project
//   - Project Manager → only projects they manage (project.managerId)
//   - Client / other  → Forbidden (403)
//
// The projectId is validated against the database on every call — an arbitrary
// projectId from the frontend can never grant access to another project.
// ============================================================================

import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'
import { ForbiddenError } from '../utils/errors'
import * as prefService from '../services/notification-preference.service'
import * as projectRepo from '../repositories/project.repository'

const router = Router()

async function authorizeProjectAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: () => void,
) {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const projectId = Number.parseInt(String(req.params.projectId), 10)
    if (!Number.isFinite(projectId) || projectId <= 0) {
      return res.status(400).json({ error: 'projectId is required' })
    }

    // Verify the project exists (never trust the client-supplied id).
    const projectRow = await projectRepo.findById(projectId)
    if (!projectRow) {
      return res.status(404).json({ error: 'Project not found' })
    }

    // Admin can access any project.
    if (user.role === 'admin') return next()

    // Manager can only manage projects they own.
    if (user.role === 'project_manager') {
      if (projectRow.managerId === user.id) return next()
      return res.status(403).json({ error: 'Access denied: you can only manage notification preferences for projects you manage' })
    }

    // Clients, developers, and any other role cannot manage project preferences.
    return res.status(403).json({ error: 'Only Admin or Manager can manage project notification preferences' })
  } catch (err: any) {
    if (err instanceof ForbiddenError) {
      return res.status(403).json({ error: err.message })
    }
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid request' })
  }
}

// GET /api/projects/:projectId/notification-preferences
router.get('/:projectId/notification-preferences', requireAuth, authorizeProjectAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = Number.parseInt(String(req.params.projectId), 10)
    const result = await prefService.getProjectNotificationPreferences(projectId)
    return res.json(result)
  } catch (err: any) {
    const status = err.statusCode && Number(err.statusCode) >= 400 && Number(err.statusCode) < 500 ? Number(err.statusCode) : 400
    return res.status(status).json({ error: err.message })
  }
})

// PUT /api/projects/:projectId/notification-preferences
router.put('/:projectId/notification-preferences', requireAuth, authorizeProjectAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = Number.parseInt(String(req.params.projectId), 10)
    const result = await prefService.updateProjectNotificationPreferences(projectId, req.body)
    return res.json(result)
  } catch (err: any) {
    const status = err.statusCode && Number(err.statusCode) >= 400 && Number(err.statusCode) < 500 ? Number(err.statusCode) : 400
    return res.status(status).json({ error: err.message })
  }
})

export default router
