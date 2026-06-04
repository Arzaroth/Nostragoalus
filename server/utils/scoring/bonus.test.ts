import { describe, it, expect } from 'vitest'
import { crowdBonus, oddsBonus } from './bonus'
import { DEFAULT_CROWD_TIERS, DEFAULT_ODDS_TIERS } from './config'

describe('crowdBonus', () => {
  it('awards nothing when the prediction did not hit', () => {
    expect(crowdBonus(false, 0, 100, DEFAULT_CROWD_TIERS, 5)).toEqual({ bonus: 0, share: null })
  })

  it('awards nothing when the denominator is below the minimum', () => {
    expect(crowdBonus(true, 1, 3, DEFAULT_CROWD_TIERS, 5)).toEqual({ bonus: 0, share: null })
  })

  it('awards nothing when there are no predictions', () => {
    expect(crowdBonus(true, 0, 0, DEFAULT_CROWD_TIERS, 0)).toEqual({ bonus: 0, share: null })
  })

  it('awards the top bonus for an ultra-rare correct pick', () => {
    expect(crowdBonus(true, 1, 1000, DEFAULT_CROWD_TIERS, 5)).toEqual({ bonus: 5, share: 0.001 })
  })

  it('awards a middle-tier bonus by share', () => {
    const result = crowdBonus(true, 3, 100, DEFAULT_CROWD_TIERS, 5)
    expect(result.bonus).toBe(3)
    expect(result.share).toBeCloseTo(0.03)
  })

  it('awards no bonus when the pick was too common (above all tiers)', () => {
    expect(crowdBonus(true, 6, 10, DEFAULT_CROWD_TIERS, 5)).toEqual({ bonus: 0, share: 0.6 })
  })

  it('sorts unsorted tiers before evaluating', () => {
    const unsorted = [
      { maxShareExclusive: 0.4, bonus: 1 },
      { maxShareExclusive: 0.005, bonus: 5 },
    ]
    expect(crowdBonus(true, 1, 1000, unsorted, 5).bonus).toBe(5)
  })
})

describe('oddsBonus', () => {
  it('awards nothing when the prediction did not hit', () => {
    expect(oddsBonus(false, 5, DEFAULT_ODDS_TIERS)).toBe(0)
  })

  it('awards nothing when odds are unknown', () => {
    expect(oddsBonus(true, null, DEFAULT_ODDS_TIERS)).toBe(0)
  })

  it('awards nothing when there are no odds tiers', () => {
    expect(oddsBonus(true, 5, null)).toBe(0)
    expect(oddsBonus(true, 5, [])).toBe(0)
  })

  it('awards the highest tier for long-shot odds', () => {
    expect(oddsBonus(true, 7, DEFAULT_ODDS_TIERS)).toBe(5)
  })

  it('awards a middle tier by odds threshold', () => {
    expect(oddsBonus(true, 4, DEFAULT_ODDS_TIERS)).toBe(3)
  })

  it('awards nothing for short odds below every threshold', () => {
    expect(oddsBonus(true, 1.5, DEFAULT_ODDS_TIERS)).toBe(0)
  })
})
