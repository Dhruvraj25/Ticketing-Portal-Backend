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
  let url = raw.trim().replace(/\/+$/, '')
  // A value configured without a scheme ("portal.example.com") would produce
  // broken relative links in emails — assume https.
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url
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

// ─── Email links ─────────────────────────────────────────────────────────────
// Email template data may arrive with links built elsewhere (e.g. by the
// frontend with its own base URL, which is localhost in development). Every
// application link rendered in an email is re-based here, in ONE place, onto
// FRONTEND_URL — keeping its path, query and hash.

/** Template-data fields that hold links to THIS application (never external URLs). */
export const APP_LINK_FIELDS = [
  'ticketLink',
  'walletLink',
  'projectLink',
  'feedbackLink',
  'loginUrl',
  'portalUrl',
  'resetLink',
  'adminUrl',
] as const

/** Re-base an application link (absolute or root-relative) onto FRONTEND_URL. */
export function toFrontendLink(link: string): string {
  const value = link.trim()
  if (!value) return link
  const base = getFrontendUrl()
  if (value.startsWith('/')) return base + value
  const match = value.match(/^https?:\/\/[^/?#]+(.*)$/i)
  if (!match) return link // not an http(s) URL (e.g. a {{placeholder}}) — leave untouched
  return base + match[1]
}

/**
 * Email template data with every application link re-based onto FRONTEND_URL.
 * Returns the same object when nothing changes; otherwise a thin overlay that
 * only replaces the rebased link fields (every other field reads through
 * unchanged, so the original object is never mutated or copied).
 */
export function withFrontendLinks<T extends object>(data: T): T {
  const source = data as Record<string, unknown>
  const changed: Record<string, string> = {}
  for (const field of APP_LINK_FIELDS) {
    const value = source[field]
    if (typeof value !== 'string' || !value) continue
    const rebased = toFrontendLink(value)
    if (rebased !== value) changed[field] = rebased
  }
  if (Object.keys(changed).length === 0) return data
  return new Proxy(data, {
    get(target, key, receiver) {
      return typeof key === 'string' && key in changed ? changed[key] : Reflect.get(target, key, receiver)
    },
    getOwnPropertyDescriptor(target, key) {
      const d = Reflect.getOwnPropertyDescriptor(target, key)
      return d && typeof key === 'string' && key in changed ? { ...d, value: changed[key] } : d
    },
  })
}