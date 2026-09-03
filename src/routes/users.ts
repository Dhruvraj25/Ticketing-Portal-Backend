import { Router, Response } from 'express'
import { requireAuth } from '../middleware/auth'
import type { AuthenticatedRequest } from '../middleware/auth'

const router = Router()

export const usersRouter = router

/**
 * PATCH /api/users/me
 *
 * Update the authenticated user's profile (About / Timezone).
 * Persists to the database and returns the updated user record.
 *
 * Body: { about?: string | null, timezone?: string | null }
 */
router.patch('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { updateMyProfile } = await import('../services/user.service')
    const result = await updateMyProfile(req.user!, req.body)
    return res.json(result)
  } catch (err: any) {
    const status = err.statusCode && Number(err.statusCode) >= 400 && Number(err.statusCode) < 500 ? Number(err.statusCode) : 400
    return res.status(status).json({ error: err.message })
  }
})