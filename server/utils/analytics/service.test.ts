import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction, round } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
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
})

describe('getAnalytics', () => {
  let db: AppDatabase

  beforeEach(async () => {
    db = (await createTestDb()).db as unknown as AppDatabase
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
})
