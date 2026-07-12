import { describe, it, expect } from 'vitest'
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
