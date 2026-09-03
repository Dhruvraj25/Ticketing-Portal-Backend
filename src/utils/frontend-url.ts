// ============================================================================
// Frontend URL — Single Source of Truth
// ============================================================================
// Every backend-generated link to the web frontend MUST come from this helper.
//
// Rules:
//   - Development may fall back to http://localhost:3000 when FRONTEND_URL is
//     intentionally unset.
//   - Production MUST NOT silently fall back to localhost. If FRONTEND_URL is
//     missing in production we throw a clear error so a bad URL can never be
//     baked into an email or API response.
// ============================================================================

const DEFAULT_DEV_FRONTEND_URL = 'http://localhost:3000'

function readFrontendUrl(): string | null {
  const raw = process.env.FRONTEND_URL
  if (!raw || raw.trim() === '') return null
  // Strip trailing slashes so links never become "//dashboard"
  return raw.trim().replace(/\/+$/, '')
}

/**
 * Resolve the configured frontend URL (no trailing slash).
 *
 * @param opts.allowLocalhostFallback - when false (production), a missing
 *   FRONTEND_URL throws instead of falling back to localhost.
 */
export function getFrontendUrl(opts?: { allowLocalhostFallback?: boolean }): string {
  const url = readFrontendUrl()
  if (url) return url

  const allowLocalhost = opts?.allowLocalhostFallback ?? process.env.NODE_ENV !== 'production'
  if (allowLocalhost) {
    return DEFAULT_DEV_FRONTEND_URL
  }

  throw new Error(
    'FRONTEND_URL is not configured. Set FRONTEND_URL to the deployed frontend URL — ' +
    'refusing to generate localhost links in production.',
  )
}

/**
 * Resolve the frontend URL, defaulting to the environment behavior:
 * dev → localhost fallback, production → throw.
 * Convenience alias for callers that want the default policy.
 */
export const frontendUrl = (): string => getFrontendUrl()