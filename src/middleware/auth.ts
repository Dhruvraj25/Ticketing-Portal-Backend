import { Request, Response, NextFunction } from 'express'
import { createHash } from 'crypto'
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

/** Parse raw cookie header into a name→value map. */
function parseRawCookies(cookieHeader: string): Map<string, string> {
  const map = new Map<string, string>()
  if (!cookieHeader) return map
  for (const pair of cookieHeader.split(';')) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx < 0) continue
    const name = pair.substring(0, eqIdx).trim()
    const value = pair.substring(eqIdx + 1).trim()
    if (name) map.set(name, value)
  }
  return map
}

/** Safe secret fingerprint — NEVER logs the secret itself. */
function getSecretFingerprint(): { configured: boolean; length: number; hashPrefix: string } {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) return { configured: false, length: 0, hashPrefix: 'none' }
  return {
    configured: true,
    length: secret.length,
    hashPrefix: createHash('sha256').update(secret).digest('hex').slice(0, 12),
  }
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const cookieNames = extractCookieNames(req.headers.cookie)
  const cookieHeader = req.headers.cookie || ''
  const parsedCookies = parseRawCookies(cookieHeader)

  // Determine the expected session cookie name (mirrors Backend/src/config/auth.ts)
  const frontendUrl = process.env.FRONTEND_URL || ''
  const useSecureCookies =
    frontendUrl.startsWith('https://') || process.env.NODE_ENV === 'production'
  const expectedCookieName = useSecureCookies
    ? '__Secure-better-auth.session_token'
    : 'better-auth.session_token'
  const hasExpectedCookie = parsedCookies.has(expectedCookieName)

  // Safe diagnostic on EVERY auth check
  console.log(
    `[Auth] session_check path=${req.path}` +
    ` hasCookie=${cookieNames.length > 0}` +
    ` expectedCookie=${expectedCookieName}` +
    ` hasExpectedCookie=${hasExpectedCookie}` +
    ` cookieNames=[${cookieNames.join(',')}]` +
    ` origin=${req.headers.origin ?? '(none)'}` +
    ` host=${req.headers.host ?? '(none)'}`,
  )

  try {
    const session = await auth.api.getSession({ headers: req.headers as Record<string, string> })
    if (!session?.user) {
      // Distinguish the exact failure reason for targeted diagnosis:
      //   COOKIE_NOT_FOUND   — the expected cookie name is not in the request
      //   SIGNATURE_OR_DB    — cookie present but HMAC verification or DB lookup failed
      //                       (wrong secret, expired session, or session not in DB)
      if (!hasExpectedCookie) {
        console.warn(
          `[Auth] session_invalid path=${req.path}` +
          ` reason=COOKIE_NOT_FOUND` +
          ` expected=${expectedCookieName}` +
          ` receivedNames=[${cookieNames.join(',')}]`,
        )
      } else {
        // Cookie name matches but session lookup failed. Log the secret
        // fingerprint so operators can compare Vercel ↔ Railway logs.
        const fp = getSecretFingerprint()
        console.warn(
          `[Auth] session_invalid path=${req.path}` +
          ` reason=SIGNATURE_OR_DB` +
          ` hasCookie=true` +
          ` secretLength=${fp.length}` +
          ` secretHashPrefix=${fp.hashPrefix}` +
          ` dbHost=${process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'MISSING'}` +
          ` dbName=${process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.replace('/', '') : 'MISSING'}`,
        )
      }
      return res.status(401).json({ error: 'Unauthorized' })
    }
    req.user = session.user as any
    next()
  } catch (err) {
    console.warn(`[Auth] session_lookup_failed path=${req.path} error=${err instanceof Error ? err.message : 'unknown'}`)
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

