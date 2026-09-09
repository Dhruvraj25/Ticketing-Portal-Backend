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
      // Safe, structured log — no cookie/token value, just enough to
      // diagnose "every request to this route is silently 401ing" without
      // needing to reproduce it manually. hasCookie distinguishes "no
      // session cookie was even sent" (a caller-side bridge bug) from "a
      // cookie was sent but the session lookup found nothing" (expired/
      // invalid session).
      console.warn(`[Auth] session_invalid path=${req.path} hasCookie=${!!req.headers.cookie}`)
      return res.status(401).json({ error: 'Unauthorized' })
    }
    req.user = session.user as any
    next()
  } catch (err) {
    console.warn(`[Auth] session_lookup_failed path=${req.path} error=${err instanceof Error ? err.message : 'unknown'}`)
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

