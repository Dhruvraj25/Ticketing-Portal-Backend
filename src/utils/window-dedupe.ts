// ============================================================================
// Window Dedupe — Suppress Exact Duplicate Events Within a Time Window
// ============================================================================
// Used by the email notification bridge to prevent duplicate emails caused by
// retries or duplicate API submissions of THE SAME event. Distinct business
// events (e.g. a second approval cycle) always carry a distinct key (or none)
// and are never suppressed — dedupe applies only to exact repeats of the same
// key inside the window.
// ============================================================================

export interface WindowDedupe {
  /** True when the exact key was already seen within the window (and records it). */
  isDuplicate(key?: string): boolean
  /** Number of keys currently tracked. */
  size(): number
  clear(): void
}

export function createWindowDedupe(windowMs: number): WindowDedupe {
  const cache = new Map<string, number>()

  function isDuplicate(key: string | undefined): boolean {
    if (!key) return false
    const now = Date.now()
    const last = cache.get(key)
    if (last !== undefined && now - last < windowMs) {
      return true
    }
    cache.set(key, now)
    // Opportunistic cleanup so the map never grows unbounded
    if (cache.size > 5000) {
      for (const [k, ts] of cache) {
        if (now - ts > windowMs) cache.delete(k)
      }
    }
    return false
  }

  return {
    isDuplicate,
    size: () => cache.size,
    clear: () => cache.clear(),
  }
}
