// ============================================================================
// Email Helpers — Case-Insensitive Identity
// ============================================================================
// Email addresses identify a user regardless of letter casing:
//   User@Company.com === user@company.com
// Every place that stores, looks up, or compares emails must normalize them
// with normalizeEmail() so the same person can never be duplicated by casing.
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Normalize an email address for storage and comparison.
 * Trims surrounding whitespace and lowercases the entire address.
 * Never throws — returns the input trimmed+lowercased (or '' for non-strings).
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}

/**
 * Compare two email addresses case-insensitively.
 */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeEmail(a) === normalizeEmail(b)
}

/**
 * Validate an email address. Returns true when the normalized form is valid.
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false
  const normalized = normalizeEmail(email)
  return normalized.length > 0 && EMAIL_REGEX.test(normalized)
}