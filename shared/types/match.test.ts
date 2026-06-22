import { describe, it, expect } from 'vitest'
import { matchHasStarted } from './match'
import type { MatchStatus } from './match'

describe('matchHasStarted', () => {
  it.each(['LIVE', 'PAUSED', 'SUSPENDED', 'INTERRUPTED', 'FINISHED'] as const)(
    'treats %s as under way',
    (status) => {
      expect(matchHasStarted(status)).toBe(true)
    },
  )

  it.each(['SCHEDULED', 'POSTPONED', 'CANCELLED', 'AWARDED'] as const)(
    'treats %s as not yet started',
    (status: MatchStatus) => {
      expect(matchHasStarted(status)).toBe(false)
    },
  )
})
