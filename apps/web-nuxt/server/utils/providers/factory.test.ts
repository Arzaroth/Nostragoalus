import { describe, it, expect, vi } from 'vitest'
import { createProvider } from './factory'

describe('createProvider', () => {
  it('creates the keyless fifa provider', () => {
    expect(createProvider({ provider: 'fifa' }).meta.name).toBe('fifa')
  })

  it('creates the football-data provider when a token is present', () => {
    const provider = createProvider({ provider: 'football-data', footballDataToken: 'tok' })
    expect(provider.meta.name).toBe('football-data')
  })

  it('throws when the football-data token is missing', () => {
    expect(() => createProvider({ provider: 'football-data' })).toThrow(/NUXT_FOOTBALL_DATA_TOKEN/)
  })

  it('creates the offline fixture provider', () => {
    expect(createProvider({ provider: 'fixture' }).meta.name).toBe('fixture')
  })

  it('creates the espn provider with a default league', () => {
    expect(createProvider({ provider: 'espn' }).meta.name).toBe('espn')
  })

  it('plumbs the league and season into the espn provider', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ events: [] }), { status: 200 }))
    const provider = createProvider({
      provider: 'espn',
      externalCompetitionId: 'eng.1',
      seasonHint: '2026',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await provider.listFixtures({ season: 'ignored' })
    const url = fetchImpl.mock.calls[0][0] as unknown as string
    expect(url).toContain('/soccer/eng.1/scoreboard?')
    expect(url).toContain('dates=2026')
  })

  it('throws for the not-yet-implemented api-football provider', () => {
    expect(() => createProvider({ provider: 'api-football', apiFootballKey: 'k' })).toThrow(/not implemented/)
  })

  it('throws for an unknown provider', () => {
    expect(() => createProvider({ provider: 'mystery' })).toThrow(/unknown match provider/)
  })
})

it('creates the uefa provider with defaults and explicit values', () => {
  const def = createProvider({ provider: 'uefa' })
  expect(def.meta.name).toBe('uefa')
  const explicit = createProvider({ provider: 'uefa', seasonHint: '2028', externalCompetitionId: '3' })
  expect(explicit.meta.name).toBe('uefa')
})
