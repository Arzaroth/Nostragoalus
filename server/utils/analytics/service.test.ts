import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction, round } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeGoalEvent, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { computeAnalytics, getAnalytics, type AnalyticsPickRow } from './service'

function row(o: Partial<AnalyticsPickRow> = {}): AnalyticsPickRow {
  return {
    homeGoals: 1,
    awayGoals: 0,
    baseTier: 'OUTCOME',
    totalPoints: 1,
    isJoker: false,
    actualHome: 2,
    actualAway: 0,
    homeTeam: 'Home',
    awayTeam: 'Away',
    homeCode: 'HOM',
    awayCode: 'AWY',
    roundLabel: 'Group 1',
    roundOrder: 1,
    stoppageHome: 0,
    stoppageAway: 0,
    ...o,
  }
}

describe('computeAnalytics', () => {
  it('reports no data for an empty pick set', () => {
    const r = computeAnalytics('World Cup', [])
    expect(r.hasData).toBe(false)
    expect(r.competitionName).toBe('World Cup')
    expect(r.totalPicks).toBe(0)
    expect(r.bestCall).toBeNull()
    expect(r.worstMiss).toBeNull()
  })

  it('counts tiers, points and accuracy, treating a null tier as a miss', () => {
    const r = computeAnalytics('C', [
      row({ baseTier: 'EXACT', totalPoints: 8 }),
      row({ baseTier: 'DIFF', totalPoints: 2 }),
      row({ baseTier: 'OUTCOME', totalPoints: 1 }),
      row({ baseTier: 'MISS', totalPoints: 0 }),
      row({ baseTier: null, totalPoints: 0 }),
    ])
    expect(r.tiers).toEqual({ exact: 1, diff: 1, outcome: 1, miss: 2 })
    expect(r.totalPicks).toBe(5)
    expect(r.totalPoints).toBe(11)
    expect(r.avgPoints).toBe(2.2)
    expect(r.accuracy).toBe(0.6)
    expect(r.exactRate).toBe(0.2)
  })

  it('measures goal over-prediction as a positive lean', () => {
    const r = computeAnalytics('C', [
      row({ homeGoals: 3, awayGoals: 2, actualHome: 1, actualAway: 0 }),
      row({ homeGoals: 2, awayGoals: 2, actualHome: 1, actualAway: 1 }),
    ])
    expect(r.goals.predictedAvg).toBe(4.5)
    expect(r.goals.actualAvg).toBe(1.5)
    expect(r.goals.lean).toBe(3)
  })

  it('surfaces a home lean and draw-blindness in the outcome mix', () => {
    // Predicts HOME every time; reality is two draws and a home win.
    const r = computeAnalytics('C', [
      row({ homeGoals: 2, awayGoals: 0, actualHome: 1, actualAway: 1 }),
      row({ homeGoals: 1, awayGoals: 0, actualHome: 0, actualAway: 0 }),
      row({ homeGoals: 3, awayGoals: 1, actualHome: 2, actualAway: 0 }),
    ])
    expect(r.outcomeLean.predicted).toEqual({ home: 3, draw: 0, away: 0 })
    expect(r.outcomeLean.actual).toEqual({ home: 1, draw: 2, away: 0 })
    expect(r.outcomeLean.homeBiasPct).toBeGreaterThan(0)
    expect(r.outcomeLean.drawGapPct).toBeLessThan(0)
  })

  it('ranks over- and under-rated teams and ignores thin samples', () => {
    // FRA: predicted to win all 3, won 0 -> over-rated (delta +1).
    // BRA: predicted to lose all 3 (away wins), actually won all -> under-rated.
    // ARG appears once -> below the min sample, excluded.
    const rows = [
      row({ homeTeam: 'France', homeCode: 'FRA', awayTeam: 'Brazil', awayCode: 'BRA', homeGoals: 2, awayGoals: 0, actualHome: 0, actualAway: 2 }),
      row({ homeTeam: 'France', homeCode: 'FRA', awayTeam: 'Brazil', awayCode: 'BRA', homeGoals: 1, awayGoals: 0, actualHome: 0, actualAway: 1 }),
      row({ homeTeam: 'France', homeCode: 'FRA', awayTeam: 'Brazil', awayCode: 'BRA', homeGoals: 3, awayGoals: 1, actualHome: 1, actualAway: 3 }),
      row({ homeTeam: 'Argentina', homeCode: 'ARG', awayTeam: 'Spain', awayCode: 'ESP', homeGoals: 1, awayGoals: 0, actualHome: 1, actualAway: 0 }),
    ]
    const r = computeAnalytics('C', rows)
    expect(r.teams.overrated[0]).toMatchObject({ code: 'FRA', delta: 1, sample: 3 })
    expect(r.teams.underrated[0]).toMatchObject({ code: 'BRA', delta: -1, sample: 3 })
    expect(r.teams.overrated.some((t) => t.code === 'ARG')).toBe(false)
  })

  it('buckets accuracy by round in sort order', () => {
    const r = computeAnalytics('C', [
      row({ roundLabel: 'Group 2', roundOrder: 2, baseTier: 'MISS', totalPoints: 0 }),
      row({ roundLabel: 'Group 1', roundOrder: 1, baseTier: 'EXACT', totalPoints: 5 }),
      row({ roundLabel: 'Group 1', roundOrder: 1, baseTier: 'MISS', totalPoints: 0 }),
    ])
    expect(r.overTime.map((o) => o.label)).toEqual(['Group 1', 'Group 2'])
    expect(r.overTime[0]).toMatchObject({ picks: 2, accuracy: 0.5, points: 5 })
    expect(r.overTime[1]).toMatchObject({ picks: 1, accuracy: 0, points: 0 })
  })

  it('picks the best call by points then tier, and the biggest miss by goal error', () => {
    const r = computeAnalytics('C', [
      row({ baseTier: 'OUTCOME', totalPoints: 3, homeGoals: 1, awayGoals: 0, actualHome: 3, actualAway: 0 }),
      row({ baseTier: 'DIFF', totalPoints: 3, homeGoals: 2, awayGoals: 0, actualHome: 3, actualAway: 1 }),
      row({ baseTier: 'MISS', totalPoints: 0, homeGoals: 0, awayGoals: 0, actualHome: 4, actualAway: 4 }),
    ])
    // Same points, DIFF outranks OUTCOME on the tie-break.
    expect(r.bestCall).toMatchObject({ tier: 'diff', points: 3 })
    // The 0-0 vs 4-4 miss has the largest goal error.
    expect(r.worstMiss).toMatchObject({ predicted: '0-0', actual: '4-4' })
  })

  it('breaks a goal-error tie on the biggest miss toward the joker', () => {
    const r = computeAnalytics('C', [
      row({ baseTier: 'MISS', totalPoints: 0, homeGoals: 0, awayGoals: 0, actualHome: 2, actualAway: 0, isJoker: false }),
      row({ baseTier: 'MISS', totalPoints: 0, homeGoals: 0, awayGoals: 0, actualHome: 2, actualAway: 0, isJoker: true }),
    ])
    expect(r.worstMiss?.isJoker).toBe(true)
  })

  it('returns no miss highlight when every pick landed', () => {
    const r = computeAnalytics('C', [row({ baseTier: 'EXACT', totalPoints: 5 })])
    expect(r.worstMiss).toBeNull()
    expect(r.bestCall).not.toBeNull()
  })

  it('keys a team by name when its country code is missing', () => {
    const r = computeAnalytics('C', [
      row({ homeTeam: 'Wanderers', homeCode: null, awayTeam: 'Rovers', awayCode: null, homeGoals: 2, awayGoals: 0, actualHome: 0, actualAway: 1 }),
      row({ homeTeam: 'Wanderers', homeCode: null, awayTeam: 'Rovers', awayCode: null, homeGoals: 1, awayGoals: 0, actualHome: 0, actualAway: 2 }),
    ])
    expect(r.teams.overrated[0]).toMatchObject({ code: null, name: 'Wanderers', sample: 2 })
    expect(r.teams.underrated[0]).toMatchObject({ code: null, name: 'Rovers' })
  })

  it('takes the miss with the strictly-largest goal error', () => {
    const r = computeAnalytics('C', [
      row({ baseTier: 'MISS', homeGoals: 0, awayGoals: 0, actualHome: 1, actualAway: 0, homeTeam: 'Small' }),
      row({ baseTier: 'MISS', homeGoals: 0, awayGoals: 0, actualHome: 5, actualAway: 0, homeTeam: 'Big' }),
    ])
    expect(r.worstMiss?.home).toBe('Big')
  })

  it('keeps the first joker miss when two joker misses tie on goal error', () => {
    const r = computeAnalytics('C', [
      row({ baseTier: 'MISS', isJoker: true, homeGoals: 0, awayGoals: 0, actualHome: 2, actualAway: 0, homeTeam: 'First' }),
      row({ baseTier: 'MISS', isJoker: true, homeGoals: 0, awayGoals: 0, actualHome: 2, actualAway: 0, homeTeam: 'Second' }),
    ])
    expect(r.worstMiss?.home).toBe('First')
  })

  it('breaks an over-rated delta tie toward the larger sample', () => {
    const overrate = (home: string, away: string) =>
      row({ homeTeam: home, homeCode: home, awayTeam: away, awayCode: away, homeGoals: 2, awayGoals: 0, actualHome: 0, actualAway: 1 })
    const r = computeAnalytics('C', [
      overrate('X', 'A'),
      overrate('X', 'B'),
      overrate('X', 'C'),
      overrate('Y', 'D'),
      overrate('Y', 'E'),
    ])
    // X and Y both predicted-to-win-lost every time (delta +1); X has the larger
    // sample so it leads. A-E appear once each, below MIN_TEAM_SAMPLE.
    expect(r.teams.overrated.map((t) => t.code)).toEqual(['X', 'Y'])
  })

  it('breaks an under-rated delta tie toward the larger sample', () => {
    // Predict the home team to win (so the away team is tipped to lose), but the
    // away team actually wins - the away team is the under-rated one.
    const underrate = (home: string, away: string) =>
      row({ homeTeam: home, homeCode: home, awayTeam: away, awayCode: away, homeGoals: 2, awayGoals: 0, actualHome: 0, actualAway: 3 })
    const r = computeAnalytics('C', [
      underrate('H1', 'P'),
      underrate('H2', 'P'),
      underrate('H3', 'P'),
      underrate('H4', 'Q'),
      underrate('H5', 'Q'),
    ])
    // P and Q were always predicted to lose but always won (delta -1); P has the
    // larger sample so it leads the under-rated list.
    expect(r.teams.underrated.map((t) => t.code)).toEqual(['P', 'Q'])
  })

  it('coalesces a null tier to MISS on both sides of the best-call tie-break', () => {
    const nullBest = computeAnalytics('C', [
      row({ baseTier: null, totalPoints: 5, homeTeam: 'Keep' }),
      row({ baseTier: 'MISS', totalPoints: 5, homeTeam: 'Other' }),
    ])
    expect(nullBest.bestCall?.home).toBe('Keep')
    const nullRow = computeAnalytics('C', [
      row({ baseTier: 'MISS', totalPoints: 5, homeTeam: 'Keep' }),
      row({ baseTier: null, totalPoints: 5, homeTeam: 'Other' }),
    ])
    expect(nullRow.bestCall?.home).toBe('Keep')
  })

  describe('fergie time', () => {
    it('is empty when no pick had an added-time goal', () => {
      const r = computeAnalytics('C', [row(), row({ homeGoals: 2, awayGoals: 2 })])
      expect(r.fergieTime).toEqual({
        matches: 0,
        goals: 0,
        netPoints: 0,
        pointsWon: 0,
        pointsLost: 0,
        biggestGain: null,
        biggestLoss: null,
      })
    })

    it('banks base points won when a stoppage goal rescues the pick', () => {
      // Picked 2-1 (home win). Finished 2-1 with a 90'+3' home goal, so pre-
      // stoppage it was 1-1 (a draw = MISS). Full time is EXACT: swing +3.
      const r = computeAnalytics('C', [
        row({ homeGoals: 2, awayGoals: 1, actualHome: 2, actualAway: 1, stoppageHome: 1, stoppageAway: 0 }),
      ])
      expect(r.fergieTime.matches).toBe(1)
      expect(r.fergieTime.goals).toBe(1)
      expect(r.fergieTime.pointsWon).toBe(3)
      expect(r.fergieTime.pointsLost).toBe(0)
      expect(r.fergieTime.netPoints).toBe(3)
      expect(r.fergieTime.biggestGain).toMatchObject({ actual: '2-1', preStoppage: '1-1', swing: 3 })
      expect(r.fergieTime.biggestLoss).toBeNull()
    })

    it('banks base points lost when a stoppage goal breaks the pick', () => {
      // Picked 1-1 (draw). Pre-stoppage it was 1-1 (EXACT = 3). A 90'+2' away
      // goal made it 1-2, an away win = MISS: swing -3.
      const r = computeAnalytics('C', [
        row({ homeGoals: 1, awayGoals: 1, actualHome: 1, actualAway: 2, stoppageHome: 0, stoppageAway: 1 }),
      ])
      expect(r.fergieTime.pointsWon).toBe(0)
      expect(r.fergieTime.pointsLost).toBe(3)
      expect(r.fergieTime.netPoints).toBe(-3)
      expect(r.fergieTime.biggestLoss).toMatchObject({ actual: '1-2', preStoppage: '1-1', swing: -3 })
      expect(r.fergieTime.biggestGain).toBeNull()
    })

    it('counts a stoppage goal that leaves the tier unchanged but scores no swing', () => {
      // Picked 0-0, finished 2-0 with one 90'+1' home goal: MISS before (0-0 vs
      // 1-0) and MISS after. The goal is counted, the swing is zero.
      const r = computeAnalytics('C', [
        row({ homeGoals: 0, awayGoals: 0, actualHome: 2, actualAway: 0, stoppageHome: 1, stoppageAway: 0 }),
      ])
      expect(r.fergieTime.matches).toBe(1)
      expect(r.fergieTime.goals).toBe(1)
      expect(r.fergieTime.netPoints).toBe(0)
      expect(r.fergieTime.biggestGain).toBeNull()
      expect(r.fergieTime.biggestLoss).toBeNull()
    })

    it('nets wins against losses and keeps the largest of each as the highlights', () => {
      const r = computeAnalytics('C', [
        row({ homeGoals: 2, awayGoals: 1, actualHome: 2, actualAway: 1, stoppageHome: 1, homeTeam: 'Win' }),
        row({ homeGoals: 1, awayGoals: 1, actualHome: 1, actualAway: 2, stoppageAway: 1, homeTeam: 'Lose' }),
      ])
      expect(r.fergieTime.matches).toBe(2)
      expect(r.fergieTime.netPoints).toBe(0)
      expect(r.fergieTime.biggestGain?.home).toBe('Win')
      expect(r.fergieTime.biggestLoss?.home).toBe('Lose')
    })

    it('keeps the largest of several gains and losses as the highlights', () => {
      const r = computeAnalytics('C', [
        row({ homeGoals: 0, awayGoals: 3, actualHome: 1, actualAway: 2, stoppageAway: 1, homeTeam: 'GainSmall' }), // +1
        row({ homeGoals: 2, awayGoals: 1, actualHome: 2, actualAway: 1, stoppageHome: 1, homeTeam: 'GainBig' }), // +3
        row({ homeGoals: 0, awayGoals: 3, actualHome: 1, actualAway: 2, stoppageAway: 1, homeTeam: 'GainSmall2' }), // +1, no upgrade
        row({ homeGoals: 0, awayGoals: 3, actualHome: 2, actualAway: 2, stoppageHome: 1, homeTeam: 'LossSmall' }), // -1
        row({ homeGoals: 1, awayGoals: 1, actualHome: 1, actualAway: 2, stoppageAway: 1, homeTeam: 'LossBig' }), // -3
        row({ homeGoals: 0, awayGoals: 3, actualHome: 2, actualAway: 2, stoppageHome: 1, homeTeam: 'LossSmall2' }), // -1, no upgrade
      ])
      expect(r.fergieTime.matches).toBe(6)
      expect(r.fergieTime.pointsWon).toBe(5)
      expect(r.fergieTime.pointsLost).toBe(5)
      expect(r.fergieTime.netPoints).toBe(0)
      expect(r.fergieTime.biggestGain?.home).toBe('GainBig')
      expect(r.fergieTime.biggestLoss?.home).toBe('LossBig')
    })

    it('scales the swing to a custom base-points config', () => {
      const r = computeAnalytics(
        'C',
        [row({ homeGoals: 2, awayGoals: 1, actualHome: 2, actualAway: 1, stoppageHome: 1 })],
        { exact: 10, diff: 5, outcome: 2, miss: 0 },
      )
      expect(r.fergieTime.netPoints).toBe(10)
    })
  })
})

describe('getAnalytics', () => {
  let db: AppDatabase

  beforeEach(async () => {
    db = (await createTestDb()).db as unknown as AppDatabase
    await ensureDefaultScoringConfig(db)
  })

  async function groupRound(competitionId: string, matchday: number): Promise<string> {
    const rows = await db.select().from(round).where(eq(round.competitionId, competitionId))
    const r = rows.find((x) => x.stage === 'GROUP' && x.matchday === matchday)
    if (!r) throw new Error('round not seeded')
    return r.id
  }

  it('throws NotFound for an unknown competition', async () => {
    await expect(getAnalytics(db, { competitionId: 'nope', userId: 'nobody' })).rejects.toThrow('competition not found')
  })

  it('reports no data when the user has no scored picks', async () => {
    const c = await seedCompetition(db, { name: 'Test Cup' })
    const u = await makeUser(db, 'alice')
    const r = await getAnalytics(db, { competitionId: c, userId: u })
    expect(r.competitionName).toBe('Test Cup')
    expect(r.hasData).toBe(false)
  })

  it('counts only scored picks with a final score', async () => {
    const c = await seedCompetition(db)
    const u = await makeUser(db, 'alice')
    const g1 = await groupRound(c, 1)

    const scored = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      kickoffTime: new Date('2026-06-01T12:00:00Z'),
      fullTimeHome: 2,
      fullTimeAway: 0,
      winner: 'HOME',
      scoringState: 'SCORED',
    })
    const pending = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      kickoffTime: new Date('2026-06-02T12:00:00Z'),
    })
    const pid = await makePrediction(db, { userId: u, matchId: scored, roundId: g1, home: 2, away: 0 })
    await makePrediction(db, { userId: u, matchId: pending, roundId: g1, home: 1, away: 1 })
    await db
      .update(prediction)
      .set({ baseTier: 'EXACT', totalPoints: 8, scoredAt: new Date() })
      .where(eq(prediction.id, pid))

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    expect(r.hasData).toBe(true)
    expect(r.totalPicks).toBe(1)
    expect(r.tiers.exact).toBe(1)
    expect(r.totalPoints).toBe(8)
    expect(r.bestCall).toMatchObject({ predicted: '2-0', actual: '2-0' })
  })

  it('credits fergie time when reconciled goals include an added-time strike', async () => {
    const c = await seedCompetition(db)
    const u = await makeUser(db, 'alice')
    const g1 = await groupRound(c, 1)
    const m = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      kickoffTime: new Date('2026-06-01T12:00:00Z'),
      fullTimeHome: 2,
      fullTimeAway: 1,
      winner: 'HOME',
      scoringState: 'SCORED',
    })
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId: g1, home: 2, away: 1 })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, scoredAt: new Date() }).where(eq(prediction.id, pid))
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "30'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: "60'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "90'+3'" })

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    // Pre-stoppage 1-1 (a draw) missed the 2-1 pick; the winner made it EXACT.
    expect(r.fergieTime).toMatchObject({ matches: 1, goals: 1, pointsWon: 3, netPoints: 3 })
    expect(r.fergieTime.biggestGain).toMatchObject({ actual: '2-1', preStoppage: '1-1', swing: 3 })
  })

  it('credits an away stoppage-time goal against a home-leaning pick', async () => {
    const c = await seedCompetition(db)
    const u = await makeUser(db, 'alice')
    const g1 = await groupRound(c, 1)
    const m = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      kickoffTime: new Date('2026-06-01T12:00:00Z'),
      fullTimeHome: 1,
      fullTimeAway: 2,
      winner: 'AWAY',
      scoringState: 'SCORED',
    })
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId: g1, home: 1, away: 2 })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, scoredAt: new Date() }).where(eq(prediction.id, pid))
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "20'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: "55'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: "90'+4'" })

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    // Pre-stoppage 1-1 (a draw) missed the 1-2 pick; the late away goal made it EXACT.
    expect(r.fergieTime).toMatchObject({ matches: 1, goals: 1, netPoints: 3 })
    expect(r.fergieTime.biggestGain).toMatchObject({ actual: '1-2', preStoppage: '1-1', swing: 3 })
  })

  it('ignores added-time goals when the goal feed disagrees with the final score', async () => {
    const c = await seedCompetition(db)
    const u = await makeUser(db, 'alice')
    const g1 = await groupRound(c, 1)
    const m = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      kickoffTime: new Date('2026-06-01T12:00:00Z'),
      fullTimeHome: 2,
      fullTimeAway: 1,
      winner: 'HOME',
      scoringState: 'SCORED',
    })
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId: g1, home: 2, away: 1 })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, scoredAt: new Date() }).where(eq(prediction.id, pid))
    // Only two recorded goals for a 2-1 result, one with an unknown minute:
    // cannot trust the timeline, so no swing.
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "90'+3'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: null })

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    expect(r.fergieTime.matches).toBe(0)
    expect(r.fergieTime.netPoints).toBe(0)
  })
})
