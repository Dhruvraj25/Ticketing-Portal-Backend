// ============================================================================
// Auth Diagnostics Endpoint — SAFE configuration fingerprint comparison
// ============================================================================
// Returns non-sensitive fingerprints of:
//   - BETTER_AUTH_SECRET (length + SHA-256 hash prefix)
//   - DATABASE_URL (host + database name only)
//   - BETTER_AUTH_URL (baseURL)
//   - Cookie configuration (expected cookie name, useSecureCookies)
//   - Frontend URL (trustedOrigins)
//   - Deployment version
//
// NEVER exposes: secret values, passwords, tokens, connection strings, keys.
// Accessible without authentication (intentional — used for config verification).
// ============================================================================

import { Router } from 'express'
import { createHash } from 'crypto'

const router = Router()

router.get('/', (_req, res) => {
  const secret = process.env.BETTER_AUTH_SECRET
  const dbUrl = process.env.DATABASE_URL

  // Safe fingerprint: length + 12-char SHA-256 prefix (not reversible)
  const secretFingerprint = secret
    ? {
        configured: true,
        length: secret.length,
        hashPrefix: createHash('sha256').update(secret).digest('hex').slice(0, 12),
      }
    : { configured: false, length: 0, hashPrefix: 'none' }

  // Safe database info: host + database name only (no credentials)
  let dbFingerprint = { host: 'MISSING', database: 'MISSING' }
  if (dbUrl) {
    try {
      const url = new URL(dbUrl)
      dbFingerprint = {
        host: url.hostname,
        database: url.pathname.replace('/', ''),
      }
    } catch {
      dbFingerprint = { host: 'INVALID_URL', database: 'INVALID_URL' }
    }
  }

  // Cookie configuration
  const frontendUrl = process.env.FRONTEND_URL || 'NOT_SET'
  const useSecureCookies =
    frontendUrl.startsWith('https://') || process.env.NODE_ENV === 'production'
  const expectedCookieName = useSecureCookies
    ? '__Secure-better-auth.session_token'
    : 'better-auth.session_token'

  // Better Auth baseURL
  const betterAuthUrl =
    process.env.BETTER_AUTH_URL ||
    `http://localhost:${process.env.PORT || 4000}`

  // Version info
  const gitCommit = process.env.GIT_COMMIT || process.env.RAILWAY_GIT_COMMIT || 'unknown'
  const deploymentTime = process.env.DEPLOY_TIME || new Date().toISOString()

  res.json({
    service: 'backend',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'unknown',
    secret: secretFingerprint,
    database: dbFingerprint,
    cookie: {
      useSecureCookies,
      expectedCookieName,
    },
    auth: {
      baseURL: betterAuthUrl,
      frontendUrl,
      trustedOrigins: [frontendUrl],
    },
    deployment: {
      gitCommit,
      deploymentTime,
      nodeVersion: process.version,
    },
    // Quick comparison fields — match these against Frontend's [AuthConfig] log
    comparison: {
      // Compare with Frontend: [AuthConfig] secretLength=XX secretHashPrefix=XXXXXXXXXXXX
      secretLength: secretFingerprint.length,
      secretHashPrefix: secretFingerprint.hashPrefix,
      // Compare database host/name
      dbHost: dbFingerprint.host,
      dbName: dbFingerprint.database,
    },
  })
})

export default router
