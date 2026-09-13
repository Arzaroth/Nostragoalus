import { describe, expect, it, vi } from 'vitest'
import { normalizeWorldRugbyRanking, worldRugbyRankingProvider } from './worldrugby-ranking'
import { ProviderRateLimitError, ProviderUpstreamError } from './types'
import { RateLimiter } from './rate-limiter'

const nowait = () => new RateLimiter(0)

function stub(body: unknown, status = 200) {
  const calls: string[] = []
  const impl = vi.fn(async (url: string | URL) => {
    calls.push(String(url))
    return new Response(JSON.stringify(body), { status })
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

describe('normalizeWorldRugbyRanking', () => {
  it('maps the three-letter abbreviation to its position', () => {
    const ranks = normalizeWorldRugbyRanking({
      entries: [
        { team: { abbreviation: 'RSA' }, pos: 1 },
        { team: { abbreviation: 'NZL' }, pos: 2 },
      ],
    })
    expect(ranks.get('RSA')).toBe(1)
    expect(ranks.get('NZL')).toBe(2)
    expect(ranks.size).toBe(2)
  })

  it('skips an entry with no code or no position rather than inventing one', () => {
    // A missing rank must not become rank 0, which would read as the best side
    // in the world.
    const ranks = normalizeWorldRugbyRanking({
      entries: [
        { team: { abbreviation: null }, pos: 3 },
        { team: { abbreviation: 'FIJ' }, pos: null },
        { team: null, pos: 4 },
        { team: { abbreviation: 'IRE' }, pos: 3 },
      ],
    })
    expect([...ranks.keys()]).toEqual(['IRE'])
  })

  it('tolerates a document with no entries', () => {
    expect(normalizeWorldRugbyRanking({}).size).toBe(0)
    expect(normalizeWorldRugbyRanking({ entries: null }).size).toBe(0)
  })
})

describe('worldRugbyRankingProvider', () => {
  const table = { entries: [{ team: { abbreviation: 'RSA' }, pos: 1 }] }

  it('reads the table for the sub-feed it was given', async () => {
    const { impl, calls } = stub(table)
    const p = worldRugbyRankingProvider({ sport: 'wru', fetchImpl: impl, rateLimiter: nowait() })
    const { ranks } = await p.getLatestRanks()
    expect(ranks.get('RSA')).toBe(1)
    expect(calls[0]).toBe('https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/wru')
  })

  it('defaults to the mens union table', async () => {
    const { impl, calls } = stub(table)
    await worldRugbyRankingProvider({ fetchImpl: impl, rateLimiter: nowait() }).getLatestRanks()
    expect(calls[0]).toContain('/rankings/mru')
    const blank = stub(table)
    await worldRugbyRankingProvider({ sport: '', fetchImpl: blank.impl, rateLimiter: nowait() }).getLatestRanks()
    expect(blank.calls[0]).toContain('/rankings/mru')
  })

  it('escapes the sub-feed into the path', async () => {
    const { impl, calls } = stub(table)
    await worldRugbyRankingProvider({ sport: '../evil', fetchImpl: impl, rateLimiter: nowait() }).getLatestRanks()
    expect(calls[0]).not.toContain('/../evil')
    expect(calls[0]).toContain('..%2Fevil')
  })

  it('treats an empty table as a failure, not an answer', async () => {
    // Returned as success it caches for 12h, and every champion pick in that
    // window resolves to a null rank - which the tiers pay at the top rate.
    const { impl } = stub({ entries: [] })
    await expect(
      worldRugbyRankingProvider({ fetchImpl: impl, rateLimiter: nowait() }).getLatestRanks(),
    ).rejects.toBeInstanceOf(ProviderUpstreamError)
  })

  it('surfaces a rate limit and an upstream failure as the shared error types', async () => {
    const limited = stub({}, 429)
    await expect(
      worldRugbyRankingProvider({ fetchImpl: limited.impl, rateLimiter: nowait() }).getLatestRanks(),
    ).rejects.toBeInstanceOf(ProviderRateLimitError)

    // The sevens feeds answer 400: there is simply no sevens ranking.
    const missing = stub({}, 400)
    await expect(
      worldRugbyRankingProvider({ sport: 'mrs', fetchImpl: missing.impl, rateLimiter: nowait() }).getLatestRanks(),
    ).rejects.toBeInstanceOf(ProviderUpstreamError)
  })
})
