// ============================================================================
// Client Notification Preferences Routes
// ============================================================================
// Admin and Manager users manage notification preferences PER CLIENT.
// Client users (standard or approver) cannot modify their own preferences.
//
// GET    /api/clients/:clientId/notification-preferences
// PUT    /api/clients/:clientId/notification-preferences
//
// Authorization:
//   - Admin: Full access within their tenant
//   - Manager: Access only to clients they manage via projects
//   - Client: Forbidden (403)
// ============================================================================

import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'
import { ForbiddenError } from '../utils/errors'
import * as prefService from '../services/notification-preference.service'
import * as userRepo from '../repositories/user.repository'
import * as projectRepo from '../repositories/project.repository'
import { assertFound, assertAccess } from '../utils/errors'

const router = Router()

/**
 * Authorization middleware for client notification preferences.
 * Verifies:
 *   1. Requester is authenticated
 *   2. Requester is NOT a client (standard or approver)
 *   3. If Manager, requester is authorized to access this client
 *   4. Client exists and belongs to the same tenant as the requester
 */
async function authorizeClientAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: () => void,
) {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const clientId = typeof req.params.clientId === 'string' ? req.params.clientId : (Array.isArray(req.params.clientId) ? req.params.clientId[0] : String(req.params.clientId))
    if (!clientId) {
      return res.status(400).json({ error: 'clientId is required' })
    }

    // Client users cannot manage preferences
    if (user.role === 'client') {
      return res.status(403).json({ error: 'Client users cannot modify notification preferences. Admin or Manager must manage client preferences.' })
    }

    // Verify the client exists
    const client = await userRepo.findByPk(clientId)
    assertFound(client, 'Client not found')
    assertAccess(client.role === 'client', 'Specified user is not a client')

    // Admin can access any client within their tenant
    if (user.role === 'admin') {
      return next()
    }

    // Manager access: must be authorized via project
    if (user.role === 'project_manager') {
      const projects = await projectRepo.findByClientId(clientId)
      const hasAccess = projects.some(p => p.managerId === user.id)
      assertAccess(hasAccess, 'Manager not authorized to access this client\'s preferences')
      return next()
    }

    // Other roles (developer, etc.) cannot manage client preferences
    return res.status(403).json({ error: 'Only Admin or Manager can manage client notification preferences' })
  } catch (err: any) {
    if (err instanceof ForbiddenError) {
      return res.status(403).json({ error: err.message })
    }
    if (err instanceof Error) {
      return res.status(400).json({ error: err.message })
    }
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// GET /api/clients/:clientId/notification-preferences
// Returns the notification preferences for a specific client.
router.get('/:clientId/notification-preferences', requireAuth, authorizeClientAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = typeof req.params.clientId === 'string' ? req.params.clientId : (Array.isArray(req.params.clientId) ? req.params.clientId[0] : String(req.params.clientId))
    const result = await prefService.getClientNotificationPreferences(clientId)
    return res.json(result)
  } catch (err: any) {
    const status = err.statusCode && Number(err.statusCode) >= 400 && Number(err.statusCode) < 500 ? Number(err.statusCode) : 400
    return res.status(status).json({ error: err.message })
  }
})

// PUT /api/clients/:clientId/notification-preferences
// Update notification preferences for a specific client.
router.put('/:clientId/notification-preferences', requireAuth, authorizeClientAccess, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clientId = typeof req.params.clientId === 'string' ? req.params.clientId : (Array.isArray(req.params.clientId) ? req.params.clientId[0] : String(req.params.clientId))
    const result = await prefService.updateClientNotificationPreferences(clientId, req.body)
    return res.json(result)
  } catch (err: any) {
    const status = err.statusCode && Number(err.statusCode) >= 400 && Number(err.statusCode) < 500 ? Number(err.statusCode) : 400
    return res.status(status).json({ error: err.message })
  }
})

export default router
