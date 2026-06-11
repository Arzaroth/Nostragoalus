import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { DEFAULT_RULES } from '../scoring/config'
import { finalizeMatches } from '../sync/finalize'
import { championPick, match, prediction, scoringConfig, user } from '../../../db/schema'
import { insertOddsSnapshots } from '../odds/store'
import { BOT_USER_ID } from '../../../shared/types/bot'
import { MIN_CONSENSUS_USERS, clearBotCache, computeConsensus, getBotChampion, getBotOverview, getBotOverviewCached } from './service'

const NOW = new Date('2026-06-15T12:00:00Z')
const PAST = new Date('2026-06-11T16:00:00Z')
const FUTURE = new Date('2026-06-20T16:00:00Z')

function scores(...rows: [number, number][]) {
  return rows.map(([home, away]) => ({ home, away }))
}

describe('computeConsensus - MODE', () => {
  it('picks the most common scoreline', () => {
    expect(computeConsensus(scores([2, 1], [2, 1], [2, 1], [1, 0], [0, 0]), 'MODE')).toEqual({
      home: 2,
      away: 1,
      count: 3,
      total: 5,
    })
  })

  it('breaks count ties by fewest total goals', () => {
    expect(computeConsensus(scores([2, 1], [2, 1], [1, 0], [1, 0], [0, 2]), 'MODE')).toMatchObject({ home: 1, away: 0 })
  })

  it('breaks equal-total ties by the higher home score', () => {
    expect(computeConsensus(scores([1, 0], [1, 0], [0, 1], [0, 1], [2, 2]), 'MODE')).toMatchObject({ home: 1, away: 0 })
  })

  it('needs at least MIN_CONSENSUS_USERS rows', () => {
    expect(computeConsensus(scores([2, 1], [2, 1], [2, 1], [2, 1]), 'MODE')).toBeNull()
    expect(MIN_CONSENSUS_USERS).toBe(5)
  })

  it('returns null for no rows', () => {
    expect(computeConsensus([], 'MODE')).toBeNull()
  })
})

describe('computeConsensus - MEAN', () => {
  it('rounds each side independently', () => {
    // home 3/3 = 1, away 1/3 = 0.33 -> 0
    expect(computeConsensus(scores([2, 0], [1, 1], [0, 0]), 'MEAN')).toEqual({ home: 1, away: 0, count: 0, total: 3 })
  })

  it('rounds .5 up and counts exact matchers', () => {
    // home 1.5 -> 2, away 0.5 -> 1
    expect(computeConsensus(scores([1, 0], [2, 1]), 'MEAN')).toEqual({ home: 2, away: 1, count: 1, total: 2 })
  })

  it('works from a single row', () => {
    expect(computeConsensus(scores([4, 2]), 'MEAN')).toEqual({ home: 4, away: 2, count: 1, total: 1 })
  })

  it('returns null for no rows', () => {
    expect(computeConsensus([], 'MEAN')).toBeNull()
  })
})

async function setup() {
  const { db, client } = await createTestDb()
  await ensureDefaultScoringConfig(db)
  const competitionId = await seedCompetition(db)
  const groupRound = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
  return { db, client, competitionId, groupRound }
}

async function makeUsers(db: TestDb, n: number, prefix = 'u'): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < n; i += 1) ids.push(await makeUser(db, `${prefix}${i}`, `${prefix}${i}`))
  return ids
}

async function predictAll(
  db: TestDb,
  userIds: string[],
  matchId: string,
  roundId: string,
  picks: [number, number, boolean?][],
): Promise<void> {
  for (let i = 0; i < picks.length; i += 1) {
    const [home, away, isJoker = false] = picks[i]
    await makePrediction(db, { userId: userIds[i], matchId, roundId, home, away, isJoker })
  }
}

describe('getBotOverview - scoring parity', () => {
  it('scores the MODE consensus with the real engine, sharing the crowd bonus denominators', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const u = await makeUsers(db, 6)
    const m = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    // share 2/6 < 0.4: the exact pick earns the crowd bonus for real users and bot alike
    await predictAll(db, u, m, groupRound, [[2, 1], [2, 1], [1, 0], [0, 0], [3, 2], [1, 1]])
    await finalizeMatches(db, NOW)

    const overview = await getBotOverview(db, competitionId, {}, NOW)
    expect(overview.method).toBe('MODE')
    expect(overview.modeAvailable).toBe(true)
    expect(overview.population).toBe(6)

    const [row] = overview.rows
    expect(row).toMatchObject({
      userId: BOT_USER_ID,
      matchId: m,
      homeGoals: 2,
      awayGoals: 1,
      baseTier: 'EXACT',
      consensusCount: 2,
      consensusTotal: 6,
      consensusMethod: 'MODE',
    })
    // Bit-for-bit parity with a real user who made the same pick.
    const [real] = await db
      .select()
      .from(prediction)
      .where(and(eq(prediction.matchId, m), eq(prediction.userId, u[0])))
    expect(row.totalPoints).toBe(real.totalPoints)
    expect(row.bonusPoints).toBe(real.bonusPoints)
    expect(Number(row.crowdShare)).toBeCloseTo(Number(real.crowdShare))

    expect(overview.summary).toMatchObject({ predictionPoints: row.totalPoints, exactCount: 1, outcomeCount: 1, gdCount: 1 })
    expect(overview.hasScores).toBe(true)
    await client.close()
  })

  it('ranks the bot below every human it ties with', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const u = await makeUsers(db, 5)
    const m = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    // 3 exacts (share 0.6, no bonus) and 2 misses; the bot consensus is also 2-1.
    await predictAll(db, u, m, groupRound, [[2, 1], [2, 1], [2, 1], [0, 0], [0, 3]])
    await finalizeMatches(db, NOW)

    const overview = await getBotOverview(db, competitionId, {}, NOW)
    expect(overview.summary.totalPoints).toBe(3)
    // Three humans tie the bot on all four ladder levels and stay above it.
    expect(overview.summary.rank).toBe(4)
    await client.close()
  })
})

describe('getBotOverview - methods and gates', () => {
  it('forces MEAN below the population threshold even when MODE is requested', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const u = await makeUsers(db, 3)
    const m = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    await predictAll(db, u, m, groupRound, [[2, 0], [1, 1], [0, 0]])
    await finalizeMatches(db, NOW)

    const overview = await getBotOverview(db, competitionId, { method: 'MODE' }, NOW)
    expect(overview).toMatchObject({ method: 'MEAN', modeAvailable: false, population: 3 })
    expect(overview.rows[0]).toMatchObject({ homeGoals: 1, awayGoals: 0 })
    await client.close()
  })

  it('omits a thin match from the MODE view but keeps it for MEAN', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const u = await makeUsers(db, 5)
    const big = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST })
    const thin = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST })
    await predictAll(db, u, big, groupRound, [[1, 0], [1, 0], [1, 0], [2, 1], [0, 0]])
    await predictAll(db, u.slice(0, 2), thin, groupRound, [[1, 1], [3, 3]])

    const mode = await getBotOverview(db, competitionId, { method: 'MODE' }, NOW)
    expect(mode.rows.map((r) => r.matchId)).toEqual([big])

    const mean = await getBotOverview(db, competitionId, { method: 'MEAN' }, NOW)
    expect(mean.rows.map((r) => r.matchId).sort()).toEqual([big, thin].sort())
    expect(mean.rows.find((r) => r.matchId === thin)).toMatchObject({ homeGoals: 2, awayGoals: 2, totalPoints: null })
    await client.close()
  })

  it('hides upcoming matches unless includeUpcoming is set', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const u = await makeUsers(db, 5)
    const upcoming = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: FUTURE })
    await predictAll(db, u, upcoming, groupRound, [[1, 0], [1, 0], [1, 0], [2, 0], [0, 0]])

    expect((await getBotOverview(db, competitionId, {}, NOW)).rows).toEqual([])

    const admin = await getBotOverview(db, competitionId, { includeUpcoming: true }, NOW)
    expect(admin.rows[0]).toMatchObject({ matchId: upcoming, homeGoals: 1, awayGoals: 0, totalPoints: null, baseTier: null })
    expect(admin.hasScores).toBe(false)
    // Ranked even before scoring (last, at 0 pts) so the ghost row is visible:
    // 5 predictors all on 0 points, the bot sits behind them.
    expect(admin.summary.rank).toBe(6)
    await client.close()
  })

  it('shows kicked-off unscored and VOID matches with pending points', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const u = await makeUsers(db, 5)
    const live = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST, status: 'LIVE' })
    const voided = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST, status: 'CANCELLED' })
    await predictAll(db, u, live, groupRound, [[1, 0], [1, 0], [1, 0], [2, 0], [0, 0]])
    await predictAll(db, u, voided, groupRound, [[2, 2], [2, 2], [2, 2], [1, 0], [0, 0]])
    await db.update(match).set({ scoringState: 'VOID' }).where(eq(match.id, voided))

    const overview = await getBotOverview(db, competitionId, {}, NOW)
    const liveRow = overview.rows.find((r) => r.matchId === live)
    const voidRow = overview.rows.find((r) => r.matchId === voided)
    expect(liveRow).toMatchObject({ homeGoals: 1, awayGoals: 0, totalPoints: null })
    expect(voidRow).toMatchObject({ homeGoals: 2, awayGoals: 2, totalPoints: null })
    expect(overview.summary.totalPoints).toBe(0)
    expect(overview.hasScores).toBe(false)
    await client.close()
  })
})

describe('getBotOverview - ODDS bonus parity', () => {
  it('scores the bot against the same closing odds real users get', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    await db.update(scoringConfig).set({ bonusSource: 'ODDS' }).where(eq(scoringConfig.isActive, true))
    const u = await makeUsers(db, 6)
    const m = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    // Closing odds snapshot before kickoff; HOME is the actual outcome.
    await insertOddsSnapshots(db, [
      {
        matchId: m,
        provider: 'sofascore',
        providerEventRef: 'e1',
        kind: 'POLL',
        current: { home: 4.5, draw: 3.4, away: 1.8 },
        initial: null,
        bookmakers: null,
        fetchedAt: new Date(PAST.getTime() - 3600_000),
      },
    ])
    await predictAll(db, u, m, groupRound, [[2, 1], [2, 1], [1, 0], [0, 0], [3, 2], [1, 1]])
    await finalizeMatches(db, NOW)

    const overview = await getBotOverview(db, competitionId, {}, NOW)
    const [row] = overview.rows
    const [real] = await db
      .select()
      .from(prediction)
      .where(and(eq(prediction.matchId, m), eq(prediction.userId, u[0])))
    // The bot picked 2-1 like u0; under ODDS its bonus must equal u0's, not 0.
    expect(row.bonusPoints).toBe(real.bonusPoints)
    expect(row.bonusPoints).toBeGreaterThan(0)
    expect(row.totalPoints).toBe(real.totalPoints)
    await client.close()
  })
})

describe('getBotOverview - rank visibility', () => {
  it('counts private league members for members (includePrivate) but not for outsiders', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const u = await makeUsers(db, 6)
    const leagueId = await makeLeague(db, { competitionId, ownerId: u[0] })
    for (const id of u.slice(1)) await addLeagueMember(db, leagueId, id) // u0 is already OWNER
    // A private member who out-scores everyone (and the bot) with an exact pick.
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, u[0]))
    const m = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    // Bot consensus is 1-1 (a DRAW miss -> 0 pts); only u0 (private) scores.
    await predictAll(db, u, m, groupRound, [[2, 1], [1, 1], [1, 1], [1, 1], [1, 1], [1, 1]])
    await finalizeMatches(db, NOW)

    // Member view: the private high scorer is on the board, so the bot (0 pts,
    // tying the 5 others) ranks behind all 6 humans.
    const memberView = await getBotOverview(db, competitionId, { leagueId, includePrivate: true }, NOW)
    expect(memberView.summary.rank).toBe(7)
    // Outsider view: the private member is excluded, leaving 5 humans.
    const outsiderView = await getBotOverview(db, competitionId, { leagueId, includePrivate: false }, NOW)
    expect(outsiderView.summary.rank).toBe(6)
    await client.close()
  })
})

describe('getBotOverview - joker', () => {
  it('plays the joker where most users played theirs, tie-broken by earliest kickoff', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const r16 = (await findRoundId(db, competitionId, 'R16', null)) as string
    const u = await makeUsers(db, 5)
    const early = await makeMatch(db, { competitionId, roundId: r16, stage: 'R16', kickoffTime: new Date('2026-06-10T16:00:00Z'), status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    const late = await makeMatch(db, { competitionId, roundId: r16, stage: 'R16', kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 0, fullTimeAway: 0 })
    // Jokers 2-2 across the round: the earlier kickoff wins the tie.
    await predictAll(db, u, early, r16, [[1, 0, true], [1, 0, true], [1, 0], [2, 0], [0, 0]])
    await predictAll(db, u, late, r16, [[0, 0], [0, 0], [0, 0, true], [1, 1, true], [2, 1]])
    // Also predict a group match so the group round has no joker to derive.
    const groupMatch = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST })
    await predictAll(db, u, groupMatch, groupRound, [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]])
    await finalizeMatches(db, NOW)

    const overview = await getBotOverview(db, competitionId, {}, NOW)
    const earlyRow = overview.rows.find((r) => r.matchId === early)
    const lateRow = overview.rows.find((r) => r.matchId === late)
    expect(earlyRow?.isJoker).toBe(true)
    expect(lateRow?.isJoker).toBe(false)
    // 1-0 exact, share 3/5 -> no bonus; base 3 doubled by the joker.
    expect(earlyRow?.totalPoints).toBe(6)
    expect(overview.rows.find((r) => r.matchId === groupMatch)?.isJoker).toBe(false)
    await client.close()
  })

  it('never places a joker on the final but still doubles it via forceJoker', async () => {
    const { db, client, competitionId } = await setup()
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const u = await makeUsers(db, 5)
    const final = await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 0, winner: 'HOME', homeTeamCode: 'BRA', awayTeamCode: 'FRA' })
    await predictAll(db, u, final, finalRound, [[2, 0], [2, 0], [2, 0], [1, 0], [0, 1]])
    await finalizeMatches(db, NOW)

    const overview = await getBotOverview(db, competitionId, {}, NOW)
    const row = overview.rows.find((r) => r.matchId === final)
    expect(row?.isJoker).toBe(false)
    // exact (3) doubled by forceJoker; share 3/5 -> no bonus.
    expect(row?.totalPoints).toBe(6)
    expect(Number(row?.jokerMultiplierApplied)).toBe(2)
    await client.close()
  })
})

describe('getBotChampion', () => {
  it('picks the most chosen team and awards the bonus once the final is decided', async () => {
    const { db, client, competitionId } = await setup()
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const u = await makeUsers(db, 5)
    for (const [i, code] of (['BRA', 'BRA', 'BRA', 'FRA', 'FRA'] as const).entries()) {
      await db.insert(championPick).values({ userId: u[i], competitionId, teamCode: code, teamName: code })
    }

    expect(await getBotChampion(db, competitionId)).toMatchObject({
      teamCode: 'BRA',
      count: 3,
      total: 5,
      awardedPoints: 0,
    })

    await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 0, winner: 'HOME', homeTeamCode: 'BRA', awayTeamCode: 'FRA' })
    expect((await getBotChampion(db, competitionId))?.awardedPoints).toBe(DEFAULT_RULES.championBonus)
    await client.close()
  })

  it('breaks ties alphabetically and returns null without picks', async () => {
    const { db, client, competitionId } = await setup()
    expect(await getBotChampion(db, competitionId)).toBeNull()

    const u = await makeUsers(db, 2)
    await db.insert(championPick).values({ userId: u[0], competitionId, teamCode: 'FRA', teamName: 'France' })
    await db.insert(championPick).values({ userId: u[1], competitionId, teamCode: 'BRA', teamName: 'Brazil' })
    expect((await getBotChampion(db, competitionId))?.teamCode).toBe('BRA')
    await client.close()
  })

  it('awards nothing when the decided winner is not the bot pick, and handles AWAY winners', async () => {
    const { db, client, competitionId } = await setup()
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const u = await makeUsers(db, 3)
    for (const [i, code] of (['BRA', 'BRA', 'ARG'] as const).entries()) {
      await db.insert(championPick).values({ userId: u[i], competitionId, teamCode: code, teamName: code })
    }
    await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 0, fullTimeAway: 1, winner: 'AWAY', homeTeamCode: 'BRA', awayTeamCode: 'ARG' })

    // ARG won but the bot picked BRA.
    expect(await getBotChampion(db, competitionId)).toMatchObject({ teamCode: 'BRA', awardedPoints: 0 })
    await client.close()
  })

  it('ignores picks without a team code', async () => {
    const { db, client, competitionId } = await setup()
    const u = await makeUsers(db, 2)
    await db.insert(championPick).values({ userId: u[0], competitionId, teamCode: null, teamName: 'TBD' })
    expect(await getBotChampion(db, competitionId)).toBeNull()

    await db.insert(championPick).values({ userId: u[1], competitionId, teamCode: 'BRA', teamName: 'Brazil' })
    // total counts only picks with a team: the null-team pick is excluded.
    expect(await getBotChampion(db, competitionId)).toMatchObject({ teamCode: 'BRA', count: 1, total: 1 })
    await client.close()
  })

  it('scopes the pick to league members', async () => {
    const { db, client, competitionId } = await setup()
    const u = await makeUsers(db, 3)
    for (const [i, code] of (['BRA', 'BRA', 'FRA'] as const).entries()) {
      await db.insert(championPick).values({ userId: u[i], competitionId, teamCode: code, teamName: code })
    }
    const leagueId = await makeLeague(db, { competitionId, ownerId: u[2] })
    expect((await getBotChampion(db, competitionId, { leagueId }))?.teamCode).toBe('FRA')
    await client.close()
  })

  it('pays the most common snapshotted points among the consensus picks, ties going low', async () => {
    const { db, client, competitionId } = await setup()
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const u = await makeUsers(db, 4)
    // Picks made at different times carry different snapshots: 25 is the mode.
    for (const [i, pts] of [25, 25, 10].entries()) {
      await db.insert(championPick).values({ userId: u[i], competitionId, teamCode: 'MAR', teamName: 'Morocco', fifaRank: 21, potentialPoints: pts })
    }
    await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0, winner: 'HOME', homeTeamCode: 'MAR', awayTeamCode: 'FRA' })
    expect((await getBotChampion(db, competitionId))?.awardedPoints).toBe(25)

    // A 1-1 split ties: the bot takes the lower (favorite-priced) value.
    await db.insert(championPick).values({ userId: u[3], competitionId, teamCode: 'MAR', teamName: 'Morocco', fifaRank: 8, potentialPoints: 10 })
    expect((await getBotChampion(db, competitionId))?.awardedPoints).toBe(10)
    await client.close()
  })
})

describe('getBotOverview - edge branches', () => {
  it('breaks an exact joker tie by match id and skips prediction-less knockout matches', async () => {
    const { db, client, competitionId } = await setup()
    const r16 = (await findRoundId(db, competitionId, 'R16', null)) as string
    const u = await makeUsers(db, 5)
    // Same kickoff, one joker each: the id decides, deterministically.
    const a = await makeMatch(db, { competitionId, roundId: r16, stage: 'R16', kickoffTime: PAST })
    const b = await makeMatch(db, { competitionId, roundId: r16, stage: 'R16', kickoffTime: PAST })
    await makeMatch(db, { competitionId, roundId: r16, stage: 'R16', kickoffTime: PAST })
    await predictAll(db, u, a, r16, [[1, 0, true], [1, 0], [1, 0], [1, 0], [1, 0]])
    await predictAll(db, u, b, r16, [[0, 0], [0, 0, true], [0, 0], [0, 0], [0, 0]])

    const overview = await getBotOverview(db, competitionId, {}, NOW)
    const winner = a < b ? a : b
    expect(overview.rows.filter((r) => r.isJoker).map((r) => r.matchId)).toEqual([winner])
    // The third match has no predictions at all and simply yields no row.
    expect(overview.rows).toHaveLength(2)
    await client.close()
  })

  it('treats a scored match without full-time scores or locked picks defensively', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const u = await makeUsers(db, 5)
    // SCORED flag but no result: consensus shows, points stay pending.
    const noResult = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST })
    await predictAll(db, u, noResult, groupRound, [[1, 0], [1, 0], [1, 0], [0, 0], [2, 0]])
    await db.update(match).set({ scoringState: 'SCORED' }).where(eq(match.id, noResult))
    // SCORED with a result but nothing locked: empty histogram, no bonus, no share.
    const noLocks = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await predictAll(db, u, noLocks, groupRound, [[1, 0], [1, 0], [1, 0], [0, 0], [2, 0]])
    await db.update(match).set({ scoringState: 'SCORED' }).where(eq(match.id, noLocks))

    const overview = await getBotOverview(db, competitionId, {}, NOW)
    expect(overview.rows.find((r) => r.matchId === noResult)).toMatchObject({ totalPoints: null })
    expect(overview.rows.find((r) => r.matchId === noLocks)).toMatchObject({
      baseTier: 'EXACT',
      totalPoints: 3,
      bonusPoints: 0,
      crowdShare: null,
    })
    await client.close()
  })

  it('adds the champion bonus into the bot summary', async () => {
    const { db, client, competitionId } = await setup()
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const u = await makeUsers(db, 5)
    const final = await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 0, winner: 'HOME', homeTeamCode: 'BRA', awayTeamCode: 'FRA' })
    await predictAll(db, u, final, finalRound, [[2, 0], [1, 0], [1, 1], [0, 1], [2, 0]])
    for (const id of u) {
      await db.insert(championPick).values({ userId: id, competitionId, teamCode: 'BRA', teamName: 'Brazil' })
    }
    await finalizeMatches(db, NOW)

    const overview = await getBotOverview(db, competitionId, {}, NOW)
    expect(overview.champion).toMatchObject({ teamCode: 'BRA', awardedPoints: 10 })
    expect(overview.summary.championPoints).toBe(10)
    expect(overview.summary.totalPoints).toBe(overview.summary.predictionPoints + 10)
    await client.close()
  })
})

describe('getBotOverview - league scope', () => {
  it('builds consensus and rank from members while keeping the bonus histogram global', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    const u = await makeUsers(db, 6)
    const m = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    // Two members pick the actual 1-0; the other four crowd onto 2-1.
    await predictAll(db, u, m, groupRound, [[1, 0], [1, 0], [2, 1], [2, 1], [2, 1], [2, 1]])
    await finalizeMatches(db, NOW)
    const leagueId = await makeLeague(db, { competitionId, ownerId: u[0] })
    await addLeagueMember(db, leagueId, u[1])

    const overview = await getBotOverview(db, competitionId, { leagueId }, NOW)
    // Two members -> MODE unavailable, MEAN consensus over members only.
    expect(overview).toMatchObject({ method: 'MEAN', modeAvailable: false, population: 2 })
    const [row] = overview.rows
    expect(row).toMatchObject({ homeGoals: 1, awayGoals: 0, baseTier: 'EXACT', consensusTotal: 2 })
    // Global share 2/6 < 0.4 earns the bonus; a members-only histogram (2/2) would not.
    expect(row.totalPoints).toBe(4)
    // Both members scored 4 and tie the bot -> bot ranks after them, non-members ignored.
    expect(overview.summary.rank).toBe(3)
    expect(overview.champion).toBeNull()
    await client.close()
  })
})


describe('getBotOverviewCached', () => {
  it('memoizes within the TTL and recomputes after clear', async () => {
    const { db, client, competitionId, groupRound } = await setup()
    clearBotCache()
    const u = await makeUsers(db, 6)
    // getBotOverviewCached uses the real wall clock, so the match must have
    // genuinely kicked off (not the test's synthetic NOW).
    const longPast = new Date('2026-06-01T16:00:00Z')
    const m = await makeMatch(db, { competitionId, roundId: groupRound, kickoffTime: longPast, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    await predictAll(db, u, m, groupRound, [[2, 1], [2, 1], [1, 0], [0, 0], [3, 2], [1, 1]])
    await finalizeMatches(db, NOW)

    const first = await getBotOverviewCached(db, competitionId, {})
    expect(first.rows).toHaveLength(1)
    // A new prediction would change consensusTotal, but the cached call returns
    // the prior result until the entry is cleared.
    await makePrediction(db, { userId: await makeUser(db, 'late', 'late'), matchId: m, roundId: groupRound, home: 2, away: 1 })
    const cached = await getBotOverviewCached(db, competitionId, {})
    expect(cached.rows[0].consensusTotal).toBe(first.rows[0].consensusTotal)

    clearBotCache()
    const fresh = await getBotOverviewCached(db, competitionId, {})
    expect(fresh.rows[0].consensusTotal).toBe(first.rows[0].consensusTotal + 1)

    // Cover the cache-key flag branches (admin upcoming + includePrivate).
    const keyed = await getBotOverviewCached(db, competitionId, { includeUpcoming: true, includePrivate: true })
    expect(keyed.summary.rank).not.toBeNull()
    await client.close()
  })

  it('has no rank with zero predictors (no ghost row)', async () => {
    const { db, client, competitionId } = await setup()
    const overview = await getBotOverview(db, competitionId, {}, NOW)
    expect(overview.population).toBe(0)
    expect(overview.summary.rank).toBeNull()
    await client.close()
  })
})
