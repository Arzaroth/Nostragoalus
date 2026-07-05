import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, type TestDb } from '../../../tests/db'
import {
  makeLeague,
  makeLeaguePrediction,
  makeMatch,
  makePrediction,
  makeUser,
  seedCompetition,
} from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { leagueMember, leaguePrediction, leaguePredictionCommitment } from '../../../db/schema'
import { ForbiddenError, LockedError, NotFoundError, ValidationError } from '../errors'
import {
  getLeagueCompleteness,
  getLeagueOverrides,
  setLeagueJoker,
  setLeaguePicksSynced,
  upsertLeaguePrediction,
  upsertPrediction,
} from './service'

const NOW = new Date('2026-06-20T00:00:00Z')
const FUTURE = new Date('2026-07-01T00:00:00Z')
const PAST = new Date('2026-06-11T00:00:00Z')

let db: TestDb
let client: PGlite
let competitionId: string
let roundId: string

beforeEach(async () => {
  ;({ db, client } = await createTestDb())
  competitionId = await seedCompetition(db)
  roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
  await makeUser(db, 'u1')
})
afterEach(async () => {
  await client.close()
})

async function openMatch() {
  return makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
}

async function picksSynced(leagueId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ synced: leagueMember.picksSynced })
    .from(leagueMember)
    .where(and(eq(leagueMember.leagueId, leagueId), eq(leagueMember.userId, userId)))
  return row.synced
}

describe('upsertLeaguePrediction', () => {
  it('writes an override and switches the league off sync', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'EASY' })
    const m = await openMatch()
    const id = await upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: m, home: 2, away: 1 }, NOW)
    expect(id).toBeTruthy()
    expect(await picksSynced(leagueId, 'u1')).toBe(false)
    const overrides = await getLeagueOverrides(db, leagueId, 'u1')
    expect(overrides).toEqual([
      { matchId: m, homeGoals: 2, awayGoals: 1, isOutcomeOnly: false, wager: null, isJoker: false },
    ])
  })

  it('updates only the supplied fields on conflict', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'HARD' })
    const m = await openMatch()
    await upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: m, home: 2, away: 1, wager: 3 }, NOW)
    await upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: m, home: 3, away: 0 }, NOW)
    let [o] = await getLeagueOverrides(db, leagueId, 'u1')
    expect(o).toMatchObject({ homeGoals: 3, awayGoals: 0, wager: 3, isOutcomeOnly: false })
    // Supplying isOutcomeOnly on a conflict updates just that field.
    await upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: m, home: 3, away: 0, isOutcomeOnly: true }, NOW)
    ;[o] = await getLeagueOverrides(db, leagueId, 'u1')
    expect(o).toMatchObject({ wager: 3, isOutcomeOnly: true })
  })

  it('rejects a non-member', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1' })
    await makeUser(db, 'outsider')
    const m = await openMatch()
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'outsider', matchId: m, home: 1, away: 0 }, NOW),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('rejects a missing match, a locked match and TBD teams', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1' })
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: 'nope', home: 1, away: 0 }, NOW),
    ).rejects.toBeInstanceOf(NotFoundError)

    const locked = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: locked, home: 1, away: 0 }, NOW),
    ).rejects.toBeInstanceOf(LockedError)

    const tbd = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE, homeTeamCode: null })
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: tbd, home: 1, away: 0 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects an override in a NORMAL league', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'NORMAL' })
    const m = await openMatch()
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: m, home: 1, away: 0 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects an invalid wager and one over the round budget', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'HARD' })
    const a = await openMatch()
    const b = await openMatch()
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: a, home: 1, away: 0, wager: -1 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
    // A fractional or out-of-range stake is rejected the same way.
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: a, home: 1, away: 0, wager: 1.5 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: a, home: 1, away: 0, wager: 1000 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
    // Two matches in the round -> budget 6. Stake 5 then 5 overflows.
    await upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: a, home: 1, away: 0, wager: 5 }, NOW)
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: b, home: 1, away: 0, wager: 5 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('counts base stakes against the override budget (effective)', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'HARD' })
    const a = await openMatch()
    const b = await openMatch() // round now has 2 matches -> budget 6
    // Base stake 4 on A (rides the base budget), then override stake on B: the
    // effective round total must count A's base stake.
    await upsertPrediction(db, { userId: 'u1', matchId: a, home: 1, away: 0, wager: 4 }, NOW)
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: b, home: 1, away: 0, wager: 3 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError) // 4 + 3 = 7 > 6
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: b, home: 1, away: 0, wager: 2 }, NOW),
    ).resolves.toBeTruthy() // 4 + 2 = 6
  })
})

describe('setLeaguePicksSynced', () => {
  it('drops open overrides on re-sync but keeps locked ones', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'NORMAL' })
    const open = await openMatch()
    const locked = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    await makeLeaguePrediction(db, { leagueId, userId: 'u1', matchId: open, roundId, home: 1, away: 0 })
    await makeLeaguePrediction(db, { leagueId, userId: 'u1', matchId: locked, roundId, home: 2, away: 2 })

    await setLeaguePicksSynced(db, { leagueId, userId: 'u1', synced: true }, NOW)
    expect(await picksSynced(leagueId, 'u1')).toBe(true)
    const remaining = await db
      .select({ matchId: leaguePrediction.matchId })
      .from(leaguePrediction)
      .where(eq(leaguePrediction.leagueId, leagueId))
    expect(remaining).toEqual([{ matchId: locked }])
  })

  it('switching to custom keeps overrides and flips the flag', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'EASY' })
    const open = await openMatch()
    await makeLeaguePrediction(db, { leagueId, userId: 'u1', matchId: open, roundId, home: 1, away: 0 })
    await setLeaguePicksSynced(db, { leagueId, userId: 'u1', synced: false }, NOW)
    expect(await picksSynced(leagueId, 'u1')).toBe(false)
    expect(await getLeagueOverrides(db, leagueId, 'u1')).toHaveLength(1)
  })

  it('rejects a non-member', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1' })
    await makeUser(db, 'outsider')
    await expect(
      setLeaguePicksSynced(db, { leagueId, userId: 'outsider', synced: true }, NOW),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('base upsertPrediction with mode fields', () => {
  it('stores outcome-only and enforces the wager budget', async () => {
    const a = await openMatch()
    const b = await openMatch()
    const idA = await upsertPrediction(db, { userId: 'u1', matchId: a, home: 1, away: 0, isOutcomeOnly: true, wager: 5 }, NOW)
    expect(idA).toBeTruthy()
    await expect(
      upsertPrediction(db, { userId: 'u1', matchId: b, home: 0, away: 1, wager: 5 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('setLeagueJoker', () => {
  it('jokers an override (creating it from base) and moves within the round', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'EASY' })
    const a = await openMatch()
    const b = await openMatch()
    await makePrediction(db, { userId: 'u1', matchId: a, roundId, home: 1, away: 0 })
    await makePrediction(db, { userId: 'u1', matchId: b, roundId, home: 2, away: 1 })

    await setLeagueJoker(db, { leagueId, userId: 'u1', matchId: a, isJoker: true }, NOW)
    expect(await picksSynced(leagueId, 'u1')).toBe(false)
    let ovs = await getLeagueOverrides(db, leagueId, 'u1')
    expect(ovs.find((o) => o.matchId === a)?.isJoker).toBe(true)

    // Move it to B: A clears, B sets (one joker per league per round).
    await setLeagueJoker(db, { leagueId, userId: 'u1', matchId: b, isJoker: true }, NOW)
    ovs = await getLeagueOverrides(db, leagueId, 'u1')
    expect(ovs.find((o) => o.matchId === a)?.isJoker).toBe(false)
    expect(ovs.find((o) => o.matchId === b)?.isJoker).toBe(true)
  })

  it('rejects missing match, locked, single-match, non-member, no pick', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'EASY' })
    await makeUser(db, 'outsider')
    await expect(setLeagueJoker(db, { leagueId, userId: 'u1', matchId: 'nope', isJoker: true }, NOW)).rejects.toBeInstanceOf(NotFoundError)
    const locked = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    await expect(setLeagueJoker(db, { leagueId, userId: 'u1', matchId: locked, isJoker: true }, NOW)).rejects.toBeInstanceOf(LockedError)
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const finalM = await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', kickoffTime: FUTURE })
    await expect(setLeagueJoker(db, { leagueId, userId: 'u1', matchId: finalM, isJoker: true }, NOW)).rejects.toBeInstanceOf(ValidationError)
    const tbd = await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE, homeTeamCode: null })
    await expect(setLeagueJoker(db, { leagueId, userId: 'u1', matchId: tbd, isJoker: true }, NOW)).rejects.toBeInstanceOf(ValidationError)
    const open = await openMatch()
    await expect(setLeagueJoker(db, { leagueId, userId: 'outsider', matchId: open, isJoker: true }, NOW)).rejects.toBeInstanceOf(ForbiddenError)
    await expect(setLeagueJoker(db, { leagueId, userId: 'u1', matchId: open, isJoker: true }, NOW)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('rejects a NORMAL league (overrides only exist in moded leagues)', async () => {
    const normal = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'NORMAL' })
    const m = await openMatch()
    await makePrediction(db, { userId: 'u1', matchId: m, roundId, home: 1, away: 0 })
    await expect(setLeagueJoker(db, { leagueId: normal, userId: 'u1', matchId: m, isJoker: true }, NOW)).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('records a league commitment for the override it seeds from the base pick', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'EASY' })
    const a = await openMatch()
    const b = await openMatch()
    await makePrediction(db, { userId: 'u1', matchId: a, roundId, home: 1, away: 0 })
    await makePrediction(db, { userId: 'u1', matchId: b, roundId, home: 2, away: 1 })

    await setLeagueJoker(db, { leagueId, userId: 'u1', matchId: a, isJoker: true }, NOW)
    const rows = await db.select().from(leaguePredictionCommitment).where(eq(leaguePredictionCommitment.matchId, a))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ leagueId, homeGoals: 1, awayGoals: 0 })
  })
})

describe('getLeagueCompleteness', () => {
  it('flags incomplete picks per league mode', async () => {
    const normal = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'NORMAL', name: 'N' })
    const easy = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'EASY', name: 'E' })
    const hard = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'HARD', name: 'H' })
    const m = await openMatch()
    // Outcome-only base pick, no stake.
    await makePrediction(db, { userId: 'u1', matchId: m, roundId, home: 1, away: 0, isOutcomeOnly: true })

    const byId = Object.fromEntries((await getLeagueCompleteness(db, 'u1', competitionId, NOW)).map((c) => [c.leagueId, c]))
    expect(byId[easy].summary).toMatchObject({ total: 1, complete: 1 })
    expect(byId[normal].summary).toMatchObject({ total: 1, incomplete: 1, needsExact: 1 })
    expect(byId[hard].summary).toMatchObject({ total: 1, incomplete: 1, needsStake: 1 })
    // Per-match issues for the card chips.
    expect(byId[easy].issues).toEqual([])
    expect(byId[normal].issues).toEqual([{ matchId: m, reason: 'NEEDS_EXACT' }])
    expect(byId[hard].issues).toEqual([{ matchId: m, reason: 'NEEDS_STAKE' }])
  })

  it('prefers a league override over the base pick', async () => {
    // Base pick has no stake (HARD -> incomplete); the override adds one.
    const hard = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'HARD' })
    const m = await openMatch()
    await makePrediction(db, { userId: 'u1', matchId: m, roundId, home: 1, away: 0 })
    await makeLeaguePrediction(db, { leagueId: hard, userId: 'u1', matchId: m, roundId, home: 2, away: 1, wager: 3 })

    const [c] = await getLeagueCompleteness(db, 'u1', competitionId, NOW)
    expect(c.summary).toMatchObject({ total: 1, complete: 1 })
  })

  it('returns empty summaries when no match is open to predict', async () => {
    await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'NORMAL' })
    await makeMatch(db, { competitionId, roundId, kickoffTime: PAST }) // locked, not predictable
    const [c] = await getLeagueCompleteness(db, 'u1', competitionId, NOW)
    expect(c.summary).toEqual({ total: 0, complete: 0, incomplete: 0, missing: 0, needsExact: 0, needsStake: 0 })
  })

  it('counts a missing pick and returns [] with no leagues', async () => {
    expect(await getLeagueCompleteness(db, 'u1', competitionId, NOW)).toEqual([])
    const normal = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'NORMAL' })
    await openMatch()
    const [c] = await getLeagueCompleteness(db, 'u1', competitionId, NOW)
    expect(c.summary).toMatchObject({ total: 1, missing: 1 })
    expect(c.leagueId).toBe(normal)
  })
})
