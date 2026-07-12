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
import { bestScorerPick, championPick, scoringConfig, user } from '../../../db/schema'
import { and, eq, isNull } from 'drizzle-orm'
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

  it('scores an override-only member, skips a member with no pick, and a match nobody picked', async () => {
    await makeUser(db, 'a')
    await makeUser(db, 'b')
    await makeUser(db, 'c')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'EASY' })
    await addLeagueMember(db, leagueId, 'b')
    await addLeagueMember(db, leagueId, 'c')
    const m = await scoredMatch(2, 1) // HOME
    await scoredMatch(0, 0) // a scored match nobody predicted
    await makePrediction(db, { userId: 'a', matchId: m, roundId, home: 1, away: 0 }) // base correct
    await makeLeaguePrediction(db, { leagueId, userId: 'c', matchId: m, roundId, home: 1, away: 0 }) // override-only, correct
    // b has no pick at all.
    const by = rowsOf(await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId }))
    expect(by.a).toMatchObject({ points: 1 })
    expect(by.c).toMatchObject({ points: 1 })
    expect(by.b).toMatchObject({ points: 0 })
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

  it('scores under an ODDS bonus source (odds resolved per outcome)', async () => {
    // Flip the default config from CROWD to ODDS so the odds-bonus branch runs.
    await db
      .update(scoringConfig)
      .set({ bonusSource: 'ODDS' })
      .where(and(eq(scoringConfig.isActive, true), isNull(scoringConfig.competitionId)))
    await makeUser(db, 'a')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'EASY' })
    const m = await scoredMatch(2, 1) // HOME wins
    await makePrediction(db, { userId: 'a', matchId: m, roundId, home: 1, away: 0 }) // HOME, correct

    const board = await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId })
    // No odds snapshot seeded -> bonus falls back to the base correct point.
    expect(rowsOf(board).a).toMatchObject({ rank: 1, points: 1, outcomeCount: 1 })
  })
})

describe('getLeagueModeBoard - rich easy board', () => {
  it('adds the configured bonus, champion + best-scorer, and live points', async () => {
    for (const u of ['u1', 'u2', 'u3', 'u4', 'u5']) await makeUser(db, u)
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'u1', mode: 'EASY' })
    // Scored HOME (2-1); only u1 called HOME (1 of 5) -> result-rarity bonus.
    const scored = await scoredMatch(2, 1)
    await makePrediction(db, { userId: 'u1', matchId: scored, roundId, home: 1, away: 0 })
    for (const u of ['u2', 'u3', 'u4', 'u5']) await makePrediction(db, { userId: u, matchId: scored, roundId, home: 0, away: 1 })
    // Competition-wide awards for u1.
    await db.insert(championPick).values({ userId: 'u1', competitionId, teamName: 'France', awardedPoints: 10 })
    await db.insert(bestScorerPick).values({ userId: 'u1', competitionId, playerId: 'p1', playerName: 'M', teamName: 'France', awardedPoints: 8 })
    // In-play match: u1 calls it right -> provisional live points.
    kickoff += 1
    const live = await makeMatch(db, {
      competitionId,
      roundId,
      kickoffTime: new Date(Date.UTC(2026, 5, 11, kickoff)),
      status: 'LIVE',
      fullTimeHome: 1,
      fullTimeAway: 0,
    })
    await makePrediction(db, { userId: 'u1', matchId: live, roundId, home: 1, away: 0 })

    const by = rowsOf(await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId }))
    // scored: base 1 + crowd result-rarity 1 = 2; + champion 10 + best-scorer 8 = 20. live: base 1.
    expect(by.u1).toMatchObject({ points: 20, livePoints: 1, rank: 1 })
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

describe('getLeagueModeBoard - edge cases', () => {
  it('scores zero before any match is decided', async () => {
    await makeUser(db, 'a')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'EASY' })
    const board = await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId })
    expect(rowsOf(board).a).toMatchObject({ rank: 1, points: 0 })
  })

  it('shares a rank when members tie on points', async () => {
    await makeUser(db, 'a')
    await makeUser(db, 'b')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'EASY' })
    await addLeagueMember(db, leagueId, 'b')
    const m = await scoredMatch(2, 1) // HOME
    await makePrediction(db, { userId: 'a', matchId: m, roundId, home: 1, away: 0 })
    await makePrediction(db, { userId: 'b', matchId: m, roundId, home: 3, away: 0 })
    const by = rowsOf(await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId }))
    expect(by.a.rank).toBe(1)
    expect(by.b.rank).toBe(1)
  })

  it('defaults hardcore lives to 1 when unset', async () => {
    await makeUser(db, 'a')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'HARDCORE', lives: 1 })
    const m = await scoredMatch(2, 1)
    await makePrediction(db, { userId: 'a', matchId: m, roundId, home: 0, away: 1 }) // wrong
    // lives omitted -> defaults to 1, so one miss eliminates.
    const by = rowsOf(await getLeagueModeBoard(db, { leagueId, mode: 'HARDCORE', competitionId })) as Record<string, SurvivalRow>
    expect(by.a).toMatchObject({ alive: false })
  })

  it('ranks survivors, the eliminated by depth, and ties together', async () => {
    for (const u of ['a', 'b', 'c', 'd', 'e']) await makeUser(db, u)
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'HARDCORE', lives: 2 })
    for (const u of ['b', 'c', 'd', 'e']) await addLeagueMember(db, leagueId, u)
    const m1 = await scoredMatch(2, 1) // HOME
    const m2 = await scoredMatch(1, 1) // DRAW
    const m3 = await scoredMatch(0, 1) // AWAY
    // A: all correct -> alive, survived 3, lives 2
    await makePrediction(db, { userId: 'a', matchId: m1, roundId, home: 1, away: 0 })
    await makePrediction(db, { userId: 'a', matchId: m2, roundId, home: 2, away: 2 })
    await makePrediction(db, { userId: 'a', matchId: m3, roundId, home: 0, away: 3 })
    // B: wrong m1 (absorbed), correct m2/m3 -> alive, survived 2, lives 1
    await makePrediction(db, { userId: 'b', matchId: m1, roundId, home: 0, away: 1 })
    await makePrediction(db, { userId: 'b', matchId: m2, roundId, home: 2, away: 2 })
    await makePrediction(db, { userId: 'b', matchId: m3, roundId, home: 0, away: 3 })
    // C: wrong m1 and m2 -> out at m2 (index 1), survived 0
    await makePrediction(db, { userId: 'c', matchId: m1, roundId, home: 0, away: 1 })
    await makePrediction(db, { userId: 'c', matchId: m2, roundId, home: 2, away: 0 })
    // D: no picks at all -> missing m1 and m2 -> out at m2 (index 1), survived 0
    // E: correct m1, wrong m2 and m3 -> out at m3 (index 2), survived 1
    await makePrediction(db, { userId: 'e', matchId: m1, roundId, home: 1, away: 0 })
    await makePrediction(db, { userId: 'e', matchId: m2, roundId, home: 2, away: 0 })
    await makePrediction(db, { userId: 'e', matchId: m3, roundId, home: 5, away: 5 })

    const by = rowsOf(await getLeagueModeBoard(db, { leagueId, mode: 'HARDCORE', competitionId, lives: 2 })) as Record<string, SurvivalRow>
    expect(by.a).toMatchObject({ rank: 1, alive: true, survived: 3, livesLeft: 2 })
    expect(by.b).toMatchObject({ rank: 1, alive: true, survived: 2, livesLeft: 1 })
    expect(by.e).toMatchObject({ rank: 3, alive: false })
    expect(by.c).toMatchObject({ rank: 4, alive: false })
    expect(by.d).toMatchObject({ rank: 4, alive: false, survived: 0 })
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

  it('hides admin-hidden members unless includeHidden', async () => {
    await makeUser(db, 'a')
    await makeUser(db, 'c')
    await db.update(user).set({ hiddenFromLeaderboard: true }).where(eq(user.id, 'c'))
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'a', mode: 'EASY' })
    await addLeagueMember(db, leagueId, 'c')

    const hidden = await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId })
    expect(hidden.rows.map((r) => r.userId)).toEqual(['a'])
    const shown = await getLeagueModeBoard(db, { leagueId, mode: 'EASY', competitionId, includeHidden: true })
    expect(shown.rows.map((r) => r.userId).sort()).toEqual(['a', 'c'])
  })
})
