import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { prediction, round, user } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { computeHeadToHead, getHeadToHead, type H2HPickRow } from './h2h'

const A = { id: 'a', name: 'Alice', image: null }
const B = { id: 'b', name: 'Bob', image: null }

function hrow(o: Partial<H2HPickRow> = {}): H2HPickRow {
  return {
    matchId: 'm',
    roundLabel: 'Group 1',
    roundOrder: 1,
    homeTeam: 'Home',
    awayTeam: 'Away',
    homeCode: 'HOM',
    awayCode: 'AWY',
    actualHome: 2,
    actualAway: 0,
    aHome: 2,
    aAway: 0,
    aPoints: 5,
    bHome: 1,
    bAway: 0,
    bPoints: 1,
    ...o,
  }
}

describe('computeHeadToHead', () => {
  it('reports no data for no shared matches', () => {
    const r = computeHeadToHead('World Cup', A, B, [])
    expect(r.hasData).toBe(false)
    expect(r.shared).toBe(0)
    expect(r.competitionName).toBe('World Cup')
    expect(r.a).toEqual(A)
    expect(r.b).toEqual(B)
  })

  it('totals points and per-match wins, losses and ties', () => {
    const r = computeHeadToHead('C', A, B, [
      hrow({ matchId: '1', aPoints: 5, bPoints: 1 }),
      hrow({ matchId: '2', aPoints: 0, bPoints: 3 }),
      hrow({ matchId: '3', aPoints: 2, bPoints: 2 }),
    ])
    expect(r.aPoints).toBe(7)
    expect(r.bPoints).toBe(6)
    expect(r.aWins).toBe(1)
    expect(r.bWins).toBe(1)
    expect(r.ties).toBe(1)
    expect(r.shared).toBe(3)
  })

  it('counts same-score and same-outcome agreement separately', () => {
    const r = computeHeadToHead('C', A, B, [
      // Identical scoreline -> both same score and same outcome.
      hrow({ matchId: '1', aHome: 2, aAway: 0, bHome: 2, bAway: 0 }),
      // Same outcome (home win) but different score.
      hrow({ matchId: '2', aHome: 2, aAway: 0, bHome: 3, bAway: 1 }),
      // Diverged outcome (home vs away).
      hrow({ matchId: '3', aHome: 2, aAway: 0, bHome: 0, bAway: 1 }),
    ])
    expect(r.agreement.sameScore).toBe(1)
    expect(r.agreement.sameOutcome).toBe(2)
  })

  it('lists diverged matches only, biggest points gap first, capped at six', () => {
    // Seven diverged matches with growing gaps, plus one agreeing match.
    const rows = Array.from({ length: 7 }, (_, i) =>
      hrow({ matchId: `d${i}`, aHome: 2, aAway: 0, bHome: 0, bAway: 1, aPoints: i, bPoints: 0 }),
    )
    rows.push(hrow({ matchId: 'agree', aHome: 1, aAway: 0, bHome: 1, bAway: 0, aPoints: 9, bPoints: 9 }))
    const r = computeHeadToHead('C', A, B, rows)
    expect(r.divergences).toHaveLength(6)
    expect(r.divergences.every((m) => m.diverged)).toBe(true)
    // d6 (gap 6) leads, d1 (gap 1) is the smallest kept; d0 (gap 0) drops off.
    expect(r.divergences[0].matchId).toBe('d6')
    expect(r.divergences.some((m) => m.matchId === 'agree')).toBe(false)
    expect(r.divergences.some((m) => m.matchId === 'd0')).toBe(false)
  })

  it('accumulates the lead round by round in sort order', () => {
    const r = computeHeadToHead('C', A, B, [
      hrow({ roundLabel: 'Group 1', roundOrder: 1, aPoints: 3, bPoints: 1 }),
      hrow({ roundLabel: 'Group 1', roundOrder: 1, aPoints: 2, bPoints: 0 }),
      hrow({ roundLabel: 'Group 2', roundOrder: 2, aPoints: 1, bPoints: 5 }),
    ])
    expect(r.overTime).toEqual([
      { label: 'Group 1', order: 1, aPoints: 5, bPoints: 1 },
      { label: 'Group 2', order: 2, aPoints: 6, bPoints: 6 },
    ])
  })
})

describe('getHeadToHead', () => {
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

  async function scoredPick(userId: string, matchId: string, roundId: string, home: number, away: number, points: number) {
    const pid = await makePrediction(db, { userId, matchId, roundId, home, away })
    await db.update(prediction).set({ baseTier: 'OUTCOME', totalPoints: points, scoredAt: new Date() }).where(eq(prediction.id, pid))
  }

  it('throws NotFound for an unknown competition', async () => {
    await expect(
      getHeadToHead(db, { competitionId: 'nope', aId: 'x', bId: 'y', viewerId: null, isAdmin: false }),
    ).rejects.toThrow('competition not found')
  })

  it('throws NotFound for an unknown player', async () => {
    const c = await seedCompetition(db)
    const u = await makeUser(db, 'alice')
    await expect(
      getHeadToHead(db, { competitionId: c, aId: u, bId: 'ghost', viewerId: null, isAdmin: false }),
    ).rejects.toThrow('user not found')
  })

  it('compares only the matches both players had scored', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const g1 = await groupRound(c, 1)
    const shared = await makeMatch(db, { competitionId: c, roundId: g1, kickoffTime: new Date('2026-06-01T12:00:00Z'), fullTimeHome: 2, fullTimeAway: 0, winner: 'HOME', scoringState: 'SCORED' })
    const aliceOnly = await makeMatch(db, { competitionId: c, roundId: g1, kickoffTime: new Date('2026-06-02T12:00:00Z'), fullTimeHome: 1, fullTimeAway: 1, winner: 'DRAW', scoringState: 'SCORED' })
    await scoredPick(alice, shared, g1, 2, 0, 3)
    await scoredPick(bob, shared, g1, 0, 1, 0)
    // Only Alice picked this one, so it is not part of the head-to-head.
    await scoredPick(alice, aliceOnly, g1, 1, 1, 3)

    const r = await getHeadToHead(db, { competitionId: c, aId: alice, bId: bob, viewerId: alice, isAdmin: false })
    expect(r.hasData).toBe(true)
    expect(r.shared).toBe(1)
    expect(r.aPoints).toBe(3)
    expect(r.bPoints).toBe(0)
    expect(r.aWins).toBe(1)
    expect(r.divergences).toHaveLength(1)
    expect(r.a.name).toBe('alice')
    expect(r.b.name).toBe('bob')
  })

  it('404s when either profile is private and the viewer cannot see it', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, bob))
    // A stranger (no shared league) cannot view Bob, so the comparison 404s.
    await expect(
      getHeadToHead(db, { competitionId: c, aId: alice, bId: bob, viewerId: alice, isAdmin: false }),
    ).rejects.toThrow('user not found')
    // An admin sees through it.
    const r = await getHeadToHead(db, { competitionId: c, aId: alice, bId: bob, viewerId: alice, isAdmin: true })
    expect(r.hasData).toBe(false)
  })
})
