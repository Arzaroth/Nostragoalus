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
import { leagueMember, leaguePrediction } from '../../../db/schema'
import { ForbiddenError, LockedError, NotFoundError, ValidationError } from '../errors'
import {
  getLeagueCompleteness,
  getLeagueOverrides,
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
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'NORMAL' })
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
    const [o] = await getLeagueOverrides(db, leagueId, 'u1')
    expect(o).toMatchObject({ homeGoals: 3, awayGoals: 0, wager: 3 })
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

  it('rejects an invalid wager and one over the round budget', async () => {
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'HARD' })
    const a = await openMatch()
    const b = await openMatch()
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: a, home: 1, away: 0, wager: -1 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
    // Two matches in the round -> budget 6. Stake 5 then 5 overflows.
    await upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: a, home: 1, away: 0, wager: 5 }, NOW)
    await expect(
      upsertLeaguePrediction(db, { leagueId, userId: 'u1', matchId: b, home: 1, away: 0, wager: 5 }, NOW),
    ).rejects.toBeInstanceOf(ValidationError)
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
  })

  it('prefers a league override over the base pick', async () => {
    const normal = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'NORMAL' })
    const m = await openMatch()
    await makePrediction(db, { userId: 'u1', matchId: m, roundId, home: 1, away: 0, isOutcomeOnly: true })
    await makeLeaguePrediction(db, { leagueId: normal, userId: 'u1', matchId: m, roundId, home: 2, away: 1, isOutcomeOnly: false })

    const [c] = await getLeagueCompleteness(db, 'u1', competitionId, NOW)
    expect(c.summary).toMatchObject({ total: 1, complete: 1 })
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
