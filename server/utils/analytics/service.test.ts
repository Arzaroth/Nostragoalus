import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction, round, scoringConfig } from '../../../db/schema'
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

  it('reports a zero streak for no picks', () => {
    expect(computeAnalytics('C', []).streak).toEqual({ current: 0, best: 0 })
  })

  it('tracks the current run and the tournament best over chronological picks', () => {
    // W W L W W W L (chronological): best run is the middle 3, current is 0.
    const r = computeAnalytics('C', [
      row({ baseTier: 'EXACT' }),
      row({ baseTier: 'DIFF' }),
      row({ baseTier: 'MISS' }),
      row({ baseTier: 'OUTCOME' }),
      row({ baseTier: 'EXACT' }),
      row({ baseTier: 'DIFF' }),
      row({ baseTier: 'MISS' }),
    ])
    expect(r.streak).toEqual({ current: 0, best: 3 })
  })

  it('keeps a live current streak when the latest picks are correct', () => {
    const r = computeAnalytics('C', [
      row({ baseTier: 'MISS' }),
      row({ baseTier: 'EXACT' }),
      row({ baseTier: 'OUTCOME' }),
    ])
    expect(r.streak).toEqual({ current: 2, best: 2 })
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

  it('carries a precomputed fergie summary through unchanged', () => {
    const fergie = {
      matches: 1,
      goals: 1,
      netPoints: 3,
      pointsWon: 3,
      pointsLost: 0,
      biggestGain: null,
      biggestLoss: null,
      breakdown: [],
    }
    expect(computeAnalytics('C', [row()], fergie).fergieTime).toBe(fergie)
    // Also on the empty path.
    expect(computeAnalytics('C', [], fergie).fergieTime).toBe(fergie)
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

  it('prices fergie time from the real replayed score of a reconciled match', async () => {
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
    // Locked, so the pick joins the field the fergie replay re-scores against.
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId: g1, home: 2, away: 1, lockedAt: new Date() })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3, scoredAt: new Date() }).where(eq(prediction.id, pid))
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "30'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: "60'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "90'+3'" })

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    // Before the 90'+3' winner it was 1-1 (a draw = 0 for the 2-1 pick); after it
    // was 2-1 (exact = 3). Real-points swing +3.
    expect(r.fergieTime).toMatchObject({ matches: 1, goals: 1, pointsWon: 3, pointsLost: 0, netPoints: 3 })
    expect(r.fergieTime.biggestGain).toMatchObject({ actual: '2-1', predicted: '2-1', gained: 3, net: 3 })
    expect(r.fergieTime.breakdown).toHaveLength(1)
  })

  it('shows a match that was nailed in added time then lost to a later added-time goal', async () => {
    const c = await seedCompetition(db)
    const u = await makeUser(db, 'alice')
    const g1 = await groupRound(c, 1)
    // 2-0 at 90', then 90'+5' (away) makes it 2-1 - the user's exact 2-1 - then
    // 90'+6' (home) makes it 3-1. Gained the exact, then lost it.
    const m = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      kickoffTime: new Date('2026-06-01T12:00:00Z'),
      fullTimeHome: 3,
      fullTimeAway: 1,
      winner: 'HOME',
      scoringState: 'SCORED',
    })
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId: g1, home: 2, away: 1, lockedAt: new Date() })
    await db.update(prediction).set({ baseTier: 'OUTCOME', totalPoints: 1, basePoints: 1, scoredAt: new Date() }).where(eq(prediction.id, pid))
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "60'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "82'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: "90'+5'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "90'+6'" })

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    // +2 (outcome->exact on the 2-1) then -2 (exact->outcome on the 3-1); net 0
    // but both sides visible, and the match still shows in the breakdown.
    expect(r.fergieTime).toMatchObject({ matches: 1, goals: 2, pointsWon: 2, pointsLost: 2, netPoints: 0 })
    expect(r.fergieTime.breakdown).toHaveLength(1)
    expect(r.fergieTime.breakdown[0]).toMatchObject({ gained: 2, lost: 2, net: 0 })
  })

  it('doubles a joker pick swing on the knockout stages that force the multiplier', async () => {
    const c = await seedCompetition(db)
    const u = await makeUser(db, 'alice')
    // FINAL forces the joker multiplier on everyone (countsDouble).
    const [finalRound] = await db
      .insert(round)
      .values({ competitionId: c, kind: 'KNOCKOUT', stage: 'FINAL', label: 'Final', sortOrder: 99 })
      .returning({ id: round.id })
    const m = await makeMatch(db, {
      competitionId: c,
      roundId: finalRound.id,
      stage: 'FINAL',
      kickoffTime: new Date('2026-07-01T12:00:00Z'),
      fullTimeHome: 3,
      fullTimeAway: 1,
      winner: 'HOME',
      scoringState: 'SCORED',
    })
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId: finalRound.id, home: 3, away: 1, lockedAt: new Date() })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 6, basePoints: 3, scoredAt: new Date() }).where(eq(prediction.id, pid))
    // 2-1 (a decisive lead, not a draw) before the 90'+3' winner, so it counts.
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "30'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: "55'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "70'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "90'+3'" })

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    // Base swing 2-1 (outcome=1) -> 3-1 (exact=3) = +2, doubled by the forced
    // final joker -> +4.
    expect(r.fergieTime).toMatchObject({ matches: 1, netPoints: 4 })
  })

  it('does not credit a bracket added-time goal that broke a draw', async () => {
    const c = await seedCompetition(db)
    const u = await makeUser(db, 'alice')
    const [ko] = await db
      .insert(round)
      .values({ competitionId: c, kind: 'KNOCKOUT', stage: 'R16', label: 'Round of 16', sortOrder: 90 })
      .returning({ id: round.id })
    const m = await makeMatch(db, {
      competitionId: c,
      roundId: ko.id,
      stage: 'R16',
      kickoffTime: new Date('2026-07-01T12:00:00Z'),
      fullTimeHome: 2,
      fullTimeAway: 1,
      winner: 'HOME',
      scoringState: 'SCORED',
    })
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId: ko.id, home: 2, away: 1, lockedAt: new Date() })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3, scoredAt: new Date() }).where(eq(prediction.id, pid))
    // 1-1 before the 90'+3' winner: the draw would have gone to extra time, so no
    // Fergie credit despite the exact 2-1.
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "30'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: "60'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "90'+3'" })

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    expect(r.fergieTime).toMatchObject({ matches: 1, goals: 1, netPoints: 0 })
    expect(r.fergieTime.breakdown).toHaveLength(0)
  })

  it('prices fergie time under an ODDS scoring config (resolving closing odds per outcome)', async () => {
    const c = await seedCompetition(db)
    const u = await makeUser(db, 'alice')
    const g1 = await groupRound(c, 1)
    // Flip the active config to ODDS: exercises the per-outcome odds resolution.
    // No odds snapshots exist, so the odds bonus is 0 and the swing is base only.
    await db.update(scoringConfig).set({ bonusSource: 'ODDS' }).where(eq(scoringConfig.isActive, true))
    const m = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      kickoffTime: new Date('2026-06-01T12:00:00Z'),
      fullTimeHome: 2,
      fullTimeAway: 1,
      winner: 'HOME',
      scoringState: 'SCORED',
    })
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId: g1, home: 2, away: 1, lockedAt: new Date() })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3, scoredAt: new Date() }).where(eq(prediction.id, pid))
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "30'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: "60'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "90'+3'" })

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    expect(r.fergieTime).toMatchObject({ matches: 1, netPoints: 3 })
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
    const pid = await makePrediction(db, { userId: u, matchId: m, roundId: g1, home: 2, away: 1, lockedAt: new Date() })
    await db.update(prediction).set({ baseTier: 'EXACT', totalPoints: 3, basePoints: 3, scoredAt: new Date() }).where(eq(prediction.id, pid))
    // Only two recorded goals for a 2-1 result: cannot trust the timeline.
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'HOME', minute: "90'+3'" })
    await makeGoalEvent(db, { matchId: m, competitionId: c, side: 'AWAY', minute: null })

    const r = await getAnalytics(db, { competitionId: c, userId: u })
    expect(r.fergieTime.matches).toBe(0)
    expect(r.fergieTime.netPoints).toBe(0)
  })
})
