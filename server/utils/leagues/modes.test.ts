import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, type TestDb } from '../../../tests/db'
import { makeCompetition, makeMatch, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { DEFAULT_BASE_POINTS } from '../scoring/tiers'
import { ConflictError } from '../errors'
import {
  CANONICAL_SCORELINE,
  EASY_CORRECT_BASE,
  HARD_BUDGET_PER_MATCH,
  HARD_EXACT_MULTIPLIER,
  LEAGUE_MODES,
  type EffectivePick,
  type ModeScoreContext,
  assertCompetitionNotRunning,
  canonicalScoreline,
  competitionIsRunning,
  easyPoints,
  hardPoints,
  hardRoundBudget,
  hardcoreSurvives,
  isEliminationMode,
  isExactMode,
  isOutcomeMode,
  modePoints,
  normalPoints,
  predictedOutcomeMatches,
  usesLives,
  usesWager,
} from './modes'

const CTX: ModeScoreContext = { base: DEFAULT_BASE_POINTS, jokerMultiplier: 2 }

function pick(over: Partial<EffectivePick> = {}): EffectivePick {
  return { home: 1, away: 0, isOutcomeOnly: false, wager: null, isJoker: false, ...over }
}

describe('mode predicates', () => {
  it('lists the four modes', () => {
    expect(LEAGUE_MODES).toEqual(['NORMAL', 'EASY', 'HARD', 'HARDCORE'])
  })

  it('classifies outcome vs exact modes', () => {
    expect(isOutcomeMode('EASY')).toBe(true)
    expect(isOutcomeMode('HARDCORE')).toBe(true)
    expect(isOutcomeMode('NORMAL')).toBe(false)
    expect(isOutcomeMode('HARD')).toBe(false)
    expect(isExactMode('NORMAL')).toBe(true)
    expect(isExactMode('HARD')).toBe(true)
    expect(isExactMode('EASY')).toBe(false)
  })

  it('flags wager, lives and elimination modes', () => {
    expect(usesWager('HARD')).toBe(true)
    expect(usesWager('EASY')).toBe(false)
    expect(usesLives('HARDCORE')).toBe(true)
    expect(usesLives('NORMAL')).toBe(false)
    expect(isEliminationMode('HARDCORE')).toBe(true)
    expect(isEliminationMode('EASY')).toBe(false)
  })
})

describe('canonical scoreline', () => {
  it('maps each outcome to a stable scoreline', () => {
    expect(canonicalScoreline('HOME')).toEqual({ home: 1, away: 0 })
    expect(canonicalScoreline('DRAW')).toEqual({ home: 1, away: 1 })
    expect(canonicalScoreline('AWAY')).toEqual({ home: 0, away: 1 })
    expect(CANONICAL_SCORELINE.AWAY).toEqual({ home: 0, away: 1 })
  })
})

describe('predictedOutcomeMatches', () => {
  it('compares outcomes, not exact scores', () => {
    expect(predictedOutcomeMatches({ home: 3, away: 0 }, { home: 1, away: 0 })).toBe(true)
    expect(predictedOutcomeMatches({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe(true)
    expect(predictedOutcomeMatches({ home: 0, away: 1 }, { home: 1, away: 0 })).toBe(false)
  })
})

describe('easyPoints', () => {
  it('pays a base plus the caller-supplied bonus for a correct pick', () => {
    expect(easyPoints(pick({ home: 1, away: 0 }), { home: 2, away: 1 }, 5, 2)).toBe(EASY_CORRECT_BASE + 5)
  })

  it('pays only the base when the bonus is zero', () => {
    expect(easyPoints(pick(), { home: 2, away: 1 }, 0, 2)).toBe(EASY_CORRECT_BASE)
  })

  it('pays nothing for a wrong outcome', () => {
    expect(easyPoints(pick({ home: 0, away: 1 }), { home: 2, away: 1 }, 5, 2)).toBe(0)
  })

  it('doubles a correct joker pick', () => {
    expect(easyPoints(pick({ isJoker: true }), { home: 2, away: 1 }, 2, 2)).toBe((EASY_CORRECT_BASE + 2) * 2)
  })
})

describe('hardPoints', () => {
  it('pays the stake for a correct outcome', () => {
    expect(hardPoints(pick({ home: 1, away: 0, wager: 5 }), { home: 2, away: 1 })).toBe(5)
  })

  it('pays double the stake for the exact score', () => {
    expect(hardPoints(pick({ home: 2, away: 1, wager: 5 }), { home: 2, away: 1 })).toBe(5 * HARD_EXACT_MULTIPLIER)
  })

  it('pays nothing for a wrong outcome', () => {
    expect(hardPoints(pick({ home: 0, away: 1, wager: 5 }), { home: 2, away: 1 })).toBe(0)
  })

  it('pays nothing without a stake', () => {
    expect(hardPoints(pick({ home: 1, away: 0, wager: null }), { home: 2, away: 1 })).toBe(0)
    expect(hardPoints(pick({ home: 1, away: 0, wager: 0 }), { home: 2, away: 1 })).toBe(0)
  })
})

describe('normalPoints', () => {
  it('scores the exact tier', () => {
    expect(normalPoints(pick({ home: 2, away: 1 }), { home: 2, away: 1 }, CTX)).toBe(DEFAULT_BASE_POINTS.exact)
  })

  it('scores the diff tier', () => {
    expect(normalPoints(pick({ home: 3, away: 2 }), { home: 2, away: 1 }, CTX)).toBe(DEFAULT_BASE_POINTS.diff)
  })

  it('scores the outcome tier', () => {
    expect(normalPoints(pick({ home: 5, away: 0 }), { home: 2, away: 1 }, CTX)).toBe(DEFAULT_BASE_POINTS.outcome)
  })

  it('scores a miss as zero', () => {
    expect(normalPoints(pick({ home: 0, away: 1 }), { home: 2, away: 1 }, CTX)).toBe(DEFAULT_BASE_POINTS.miss)
  })

  it('doubles a joker pick', () => {
    expect(normalPoints(pick({ home: 2, away: 1, isJoker: true }), { home: 2, away: 1 }, CTX)).toBe(
      DEFAULT_BASE_POINTS.exact * 2,
    )
  })
})

describe('modePoints dispatch', () => {
  it('delegates by mode and returns zero for hardcore', () => {
    const actual = { home: 2, away: 1 }
    expect(modePoints('EASY', pick(), actual, 0, CTX)).toBe(EASY_CORRECT_BASE)
    // HARD ignores the bonus (pure stake).
    expect(modePoints('HARD', pick({ wager: 4 }), actual, 99, CTX)).toBe(4)
    expect(modePoints('NORMAL', pick({ home: 2, away: 1 }), actual, 99, CTX)).toBe(DEFAULT_BASE_POINTS.exact)
    expect(modePoints('HARDCORE', pick(), actual, 0, CTX)).toBe(0)
  })
})

describe('hardcoreSurvives', () => {
  it('survives a correct pick', () => {
    expect(hardcoreSurvives(pick({ home: 1, away: 0 }), { home: 2, away: 1 })).toBe(true)
  })

  it('falls on a wrong pick', () => {
    expect(hardcoreSurvives(pick({ home: 0, away: 1 }), { home: 2, away: 1 })).toBe(false)
  })

  it('falls on a missing pick', () => {
    expect(hardcoreSurvives(null, { home: 2, away: 1 })).toBe(false)
    expect(hardcoreSurvives(undefined, { home: 2, away: 1 })).toBe(false)
  })
})

describe('hardRoundBudget', () => {
  it('scales with the round size', () => {
    expect(hardRoundBudget(6)).toBe(6 * HARD_BUDGET_PER_MATCH)
    expect(hardRoundBudget(0)).toBe(0)
    expect(hardRoundBudget(-3)).toBe(0)
  })
})

describe('competition running guard', () => {
  let db: TestDb
  let client: PGlite
  const PAST = new Date('2026-06-11T00:00:00Z')
  const FUTURE = new Date('2026-07-01T00:00:00Z')
  const NOW = new Date('2026-06-20T00:00:00Z')

  beforeEach(async () => {
    ;({ db, client } = await createTestDb())
  })
  afterEach(async () => {
    await client.close()
  })

  it('is running once a match has kicked off', async () => {
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    expect(await competitionIsRunning(db, competitionId, NOW)).toBe(true)
    await expect(assertCompetitionNotRunning(db, competitionId, NOW)).rejects.toBeInstanceOf(ConflictError)
  })

  it('is not running while every match is in the future', async () => {
    const competitionId = await seedCompetition(db)
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    expect(await competitionIsRunning(db, competitionId, NOW)).toBe(false)
    await expect(assertCompetitionNotRunning(db, competitionId, NOW)).resolves.toBeUndefined()
  })

  it('ignores matches in other competitions', async () => {
    const competitionId = await seedCompetition(db)
    const other = await makeCompetition(db, { slug: 'other' })
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    expect(await competitionIsRunning(db, other, NOW)).toBe(false)
  })
})
