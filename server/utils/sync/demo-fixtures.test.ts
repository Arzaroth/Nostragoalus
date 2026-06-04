import { describe, it, expect } from 'vitest'
import { DEMO_FIXTURES } from './demo-fixtures'

describe('DEMO_FIXTURES', () => {
  it('provides group-stage fixtures with the required shape', () => {
    expect(DEMO_FIXTURES.length).toBeGreaterThan(0)
    for (const f of DEMO_FIXTURES) {
      expect(f.providerMatchId).toBeTruthy()
      expect(f.stage).toBe('GROUP')
      expect(f.matchday).toBe(1)
      expect(f.homeTeam.name).toBeTruthy()
    }
  })
})
