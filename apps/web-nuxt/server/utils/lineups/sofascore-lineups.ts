import { RateLimiter } from '../providers/rate-limiter'
import { SOFASCORE_BASE_URL, SOFASCORE_UA, sofascoreFetch } from '../providers/sofascore-http'
import type { SofaLineupsResponse } from './sofascore-positions'

export interface SofascoreLineupsOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  rateLimiter?: RateLimiter
}

// Fetch a Sofascore event's line-ups. Best-effort: null on any miss (404, a
// Cloudflare bot-challenge, an upstream error, or non-JSON) so position
// refinement degrades to FIFA's formation-band fallback rather than failing the
// whole line-up. The route persists the result, so this is hit rarely.
export async function fetchSofascoreLineups(eventRef: string, opts: SofascoreLineupsOptions = {}): Promise<SofaLineupsResponse | null> {
  const baseUrl = opts.baseUrl ?? SOFASCORE_BASE_URL
  const doFetch = opts.fetchImpl ?? sofascoreFetch()
  const limiter = opts.rateLimiter ?? new RateLimiter(0)
  try {
    await limiter.acquire()
    const res = await doFetch(`${baseUrl}/api/v1/event/${encodeURIComponent(eventRef)}/lineups`, { headers: { 'user-agent': SOFASCORE_UA } })
    if (!res.ok) return null
    return (await res.json()) as SofaLineupsResponse
  } catch {
    return null
  }
}
