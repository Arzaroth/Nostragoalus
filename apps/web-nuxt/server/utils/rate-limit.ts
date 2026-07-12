// Minimal in-process sliding-window limiter (single long-running server, like
// the live hub). Not a security boundary - it turns brute-force attempts on
// guessable inputs (league join codes) from cheap to pointless.

export interface RateLimiter {
  // True when the call is allowed; false when the key is over budget.
  allow: (key: string) => boolean
}

export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now
  const hits = new Map<string, number[]>()
  return {
    allow(key: string): boolean {
      const t = now()
      const cutoff = t - opts.windowMs
      const recent = (hits.get(key) ?? []).filter((x) => x > cutoff)
      // Lazily drop idle keys so the map doesn't grow with every user ever seen.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) {
          if (!v.some((x) => x > cutoff)) hits.delete(k)
        }
      }
      if (recent.length >= opts.limit) {
        hits.set(key, recent)
        return false
      }
      recent.push(t)
      hits.set(key, recent)
      return true
    },
  }
}
