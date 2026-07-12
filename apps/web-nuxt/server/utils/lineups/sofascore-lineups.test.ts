import { describe, it, expect } from 'vitest'
import { fetchSofascoreLineups } from './sofascore-lineups'
import { RateLimiter } from '../providers/rate-limiter'

describe('fetchSofascoreLineups', () => {
  it('parses the body and hits the event lineups path', async () => {
    let url = ''
    const fetchImpl = (async (u: string) => {
      url = u
      return new Response(JSON.stringify({ confirmed: true }))
    }) as unknown as typeof fetch
    const res = await fetchSofascoreLineups('evt9', { fetchImpl, rateLimiter: new RateLimiter(0) })
    expect(res).toEqual({ confirmed: true })
    expect(url).toContain('/api/v1/event/evt9/lineups')
  })

  it('returns null on a non-ok response or a thrown fetch (best effort)', async () => {
    expect(await fetchSofascoreLineups('e', { fetchImpl: (async () => new Response('', { status: 403 })) as unknown as typeof fetch })).toBeNull()
    expect(await fetchSofascoreLineups('e', { fetchImpl: (async () => { throw new Error('net') }) as unknown as typeof fetch })).toBeNull()
  })
})
