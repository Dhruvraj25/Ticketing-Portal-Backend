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

/** Cookie NAMES only, never values — safe to log. */
function extractCookieNames(cookieHeader: string | undefined): string[] {
  if (!cookieHeader) return []
  return cookieHeader
    .split(';')
    .map((pair) => pair.split('=')[0]?.trim())
    .filter((name): name is string => !!name)
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const cookieNames = extractCookieNames(req.headers.cookie)
  // Safe, structured diagnostic on EVERY auth check — cookie names/counts
  // only, never values, never the token/session id. origin/host let us
  // confirm the request is actually arriving from the expected Vercel
  // Frontend, not just "some" caller.
  console.log(
    `[Auth] session_check path=${req.path} hasCookie=${cookieNames.length > 0} ` +
    `cookieNames=[${cookieNames.join(',')}] origin=${req.headers.origin ?? '(none)'} host=${req.headers.host ?? '(none)'}`,
  )
  try {
    const session = await auth.api.getSession({ headers: req.headers as Record<string, string> })
    if (!session?.user) {
      // hasCookie distinguishes "no session cookie was even sent" (a
      // caller-side bridge bug) from "a cookie was sent but the session
      // lookup found nothing" (expired/invalid session, or — as diagnosed
      // in this exact incident — a signing-secret/database mismatch between
      // the service that ISSUED the session and the service verifying it).
      console.warn(`[Auth] session_invalid path=${req.path} hasCookie=${cookieNames.length > 0} cookieNames=[${cookieNames.join(',')}]`)
      return res.status(401).json({ error: 'Unauthorized' })
    }
    req.user = session.user as any
    next()
  } catch (err) {
    console.warn(`[Auth] session_lookup_failed path=${req.path} error=${err instanceof Error ? err.message : 'unknown'}`)
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

