import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { createTestDb, type TestDb } from '../../../tests/db'
import {
  addLeagueMember,
  makeLeague,
  makeLeaguePrediction,
  makeMatch,
  makePrediction,
  makeUser,
  seedCompetition,
} from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { user } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { getLeagueModeBoard, type ModePointsRow, type SurvivalRow } from './modes'

let db: TestDb
let client: PGlite
let competitionId: string
let roundId: string

beforeEach(async () => {
  ;({ db, client } = await createTestDb())
  await ensureDefaultScoringConfig(db)
  competitionId = await seedCompetition(db)
  roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
})
afterEach(async () => {
  await client.close()
})

let kickoff = 0
async function scoredMatch(home: number, away: number) {
  kickoff += 1
  return makeMatch(db, {
    competitionId,
    roundId,
    kickoffTime: new Date(Date.UTC(2026, 5, 11, kickoff)),
    status: 'FINISHED',
    fullTimeHome: home,
    fullTimeAway: away,
    scoringState: 'SCORED',
  })
}

function rowsOf(board: { rows: ModePointsRow[] | SurvivalRow[] }) {
  return Object.fromEntries(board.rows.map((r) => [r.userId, r]))
}

describe('getLeagueModeBoard - EASY', () => {
  it('scores a correct outcome and ranks members', async () => {
    await makeUser(db, 'a')
    await makeUser(db, 'b')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'EASY' })
    await addLeagueMember(db, leagueId, 'b')
    const m = await scoredMatch(2, 1) // HOME wins
    await makePrediction(db, { userId: 'a', matchId: m, roundId, home: 1, away: 0 }) // HOME, correct
    await makePrediction(db, { userId: 'b', matchId: m, roundId, home: 0, away: 1 }) // AWAY, wrong

    const board = await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId })
    expect(board.kind).toBe('points')
    const by = rowsOf(board)
    expect(by.a).toMatchObject({ rank: 1, points: 1, outcomeCount: 1 }) // base 1, no odds
    expect(by.b).toMatchObject({ rank: 2, points: 0, outcomeCount: 0 })
  })

  it('uses the league override over the base pick', async () => {
    await makeUser(db, 'a')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'EASY' })
    const m = await scoredMatch(2, 1) // HOME
    await makePrediction(db, { userId: 'a', matchId: m, roundId, home: 0, away: 1 }) // base wrong
    await makeLeaguePrediction(db, { leagueId, userId: 'a', matchId: m, roundId, home: 1, away: 0 }) // override correct

    const board = await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId })
    expect(rowsOf(board).a).toMatchObject({ points: 1 })
  })
})

describe('getLeagueModeBoard - HARD', () => {
  it('pays the stake, doubling for an exact score', async () => {
    await makeUser(db, 'a')
    await makeUser(db, 'b')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'HARD' })
    await addLeagueMember(db, leagueId, 'b')
    const m = await scoredMatch(2, 1) // HOME
    await makePrediction(db, { userId: 'a', matchId: m, roundId, home: 2, away: 1, wager: 3 }) // exact -> 6
    await makePrediction(db, { userId: 'b', matchId: m, roundId, home: 3, away: 0, wager: 2 }) // outcome -> 2

    const by = rowsOf(await getLeagueModeBoard(db, { leagueId, mode: 'HARD', competitionId }))
    expect(by.a).toMatchObject({ rank: 1, points: 6, exactCount: 1 })
    expect(by.b).toMatchObject({ rank: 2, points: 2, exactCount: 0 })
  })
})

describe('getLeagueModeBoard - HARDCORE', () => {
  it('eliminates wrong picks and crowns survivors', async () => {
    await makeUser(db, 'a')
    await makeUser(db, 'b')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'HARDCORE', lives: 1 })
    await addLeagueMember(db, leagueId, 'b')
    const m1 = await scoredMatch(2, 1) // HOME
    const m2 = await scoredMatch(1, 1) // DRAW
    await makePrediction(db, { userId: 'a', matchId: m1, roundId, home: 1, away: 0 }) // HOME ok
    await makePrediction(db, { userId: 'a', matchId: m2, roundId, home: 2, away: 2 }) // DRAW ok
    await makePrediction(db, { userId: 'b', matchId: m1, roundId, home: 0, away: 1 }) // AWAY -> out at m1

    const board = await getLeagueModeBoard(db, { leagueId, mode: 'HARDCORE', competitionId, lives: 1 })
    expect(board.kind).toBe('survival')
    const by = rowsOf(board) as Record<string, SurvivalRow>
    expect(by.a).toMatchObject({ rank: 1, alive: true, livesLeft: 1, survived: 2 })
    expect(by.b).toMatchObject({ rank: 2, alive: false, livesLeft: 0 })
    expect(by.b.eliminatedRoundLabel).toBeTruthy()
  })

  it('lets extra lives absorb a wrong pick', async () => {
    await makeUser(db, 'a')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'HARDCORE', lives: 2 })
    const m1 = await scoredMatch(2, 1) // HOME
    await makePrediction(db, { userId: 'a', matchId: m1, roundId, home: 0, away: 1 }) // wrong, burns one life

    const by = rowsOf(await getLeagueModeBoard(db, { leagueId, mode: 'HARDCORE', competitionId, lives: 2 })) as Record<string, SurvivalRow>
    expect(by.a).toMatchObject({ alive: true, livesLeft: 1 })
  })
})

describe('getLeagueModeBoard - visibility', () => {
  it('hides private profiles unless entitled', async () => {
    await makeUser(db, 'a')
    await makeUser(db, 'b')
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, 'b'))
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'EASY' })
    await addLeagueMember(db, leagueId, 'b')

    const hidden = await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId })
    expect(hidden.rows.map((r) => r.userId)).toEqual(['a'])

    const shown = await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId, includePrivate: true })
    expect(shown.rows.map((r) => r.userId).sort()).toEqual(['a', 'b'])

    const self = await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId, alwaysIncludeUserId: 'b' })
    expect(self.rows.map((r) => r.userId).sort()).toEqual(['a', 'b'])
  })
})
