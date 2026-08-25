import { Request, Response, NextFunction } from 'express'
import { auth } from '../config/auth'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    name: string
    email: string
    role: string
  }
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: req.headers as Record<string, string> })
    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    req.user = session.user as any
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

