import { describe, expect, it } from 'vitest'
import { isProviderSport, PROVIDER_SPORTS, SPORTS, sportForProvider } from './sport'
import { MATCH_PROVIDERS } from '../server/utils/providers/factory'

describe('sportForProvider', () => {
  it('maps each match provider to the sport it serves', () => {
    expect(sportForProvider('fifa')).toBe('FOOTBALL')
    expect(sportForProvider('espn')).toBe('FOOTBALL')
    expect(sportForProvider('worldrugby')).toBe('RUGBY_UNION')
  })

  // The sport is looked up rather than posted, so an unmapped provider would
  // silently file a rugby competition under football.
  it('covers every provider a competition can be bound to', () => {
    for (const provider of MATCH_PROVIDERS) {
      expect(SPORTS, provider).toContain(sportForProvider(provider))
    }
  })

  it('falls back to football for an unknown provider', () => {
    expect(sportForProvider('nope')).toBe('FOOTBALL')
  })
})

describe('isProviderSport', () => {
  it('accepts a feed a provider actually offers', () => {
    expect(isProviderSport('mru')).toBe(true)
    expect(isProviderSport('wrs')).toBe(true)
  })

  it('rejects anything else, so it cannot reach a provider URL', () => {
    // The value is interpolated into a path and stored on the competition row.
    expect(isProviderSport('xyz')).toBe(false)
    expect(isProviderSport('MRU')).toBe(false)
    expect(isProviderSport('')).toBe(false)
  })

  it('covers every feed the picker offers', () => {
    for (const feed of PROVIDER_SPORTS.worldrugby ?? []) {
      expect(isProviderSport(feed.value), feed.value).toBe(true)
    }
  })
})

describe('PROVIDER_SPORTS', () => {
  it('only splits the providers that actually have several feeds', () => {
    expect(PROVIDER_SPORTS.fifa).toBeUndefined()
    expect(PROVIDER_SPORTS.espn).toBeUndefined()
    expect(PROVIDER_SPORTS.worldrugby?.map((f) => f.value)).toContain('mru')
  })

  it('names every sub-feed it offers', () => {
    for (const feed of PROVIDER_SPORTS.worldrugby ?? []) {
      expect(feed.value).toMatch(/^[a-z]{3}$/)
      expect(feed.label.length).toBeGreaterThan(0)
    }
  })
})
