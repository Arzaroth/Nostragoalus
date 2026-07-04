import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { competition, competitionAward, prediction, round } from '../../../db/schema'
import type { BaseTier } from '../scoring/tiers'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { awardCompetitionTrophies, criteriaMatchFilter, rankCriteria } from './service'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
})

async function roundId(competitionId: string, stage: string, matchday: number | null = null): Promise<string> {
  const rows = await db.select().from(round).where(eq(round.competitionId, competitionId))
  const r = rows.find((x) => x.stage === stage && (matchday === null || x.matchday === matchday))
  if (!r) throw new Error(`round ${stage}/${matchday} not seeded`)
  return r.id
}

async function score(predId: string, total: number, tier: BaseTier): Promise<void> {
  await db
    .update(prediction)
    .set({ totalPoints: total, basePoints: total, baseTier: tier, scoredAt: new Date(), scoredAtVersion: 1 })
    .where(eq(prediction.id, predId))
}

// Alice, Bob, Carol across two group matches + a decided final. Alice tops the
// board, knockout and IRMA; Alice+Bob tie on the group; the final involves FRA so
// Alice also tops the featured-team subset when FRA is the featured team.
async function scenario(featured: string | null): Promise<{ competitionId: string; alice: string; bob: string }> {
  const competitionId = await seedCompetition(db)
  if (featured) await db.update(competition).set({ featuredTeamCode: featured }).where(eq(competition.id, competitionId))

  const alice = await makeUser(db, 'alice')
  const bob = await makeUser(db, 'bob')
  const carol = await makeUser(db, 'carol')

  const groupRound = await roundId(competitionId, 'GROUP', 1)
  const finalRound = await roundId(competitionId, 'FINAL')
  const kickoff = new Date('2026-06-11T18:00:00Z')

  // g1 involves FRA (home); g2 does not; the final involves FRA (home).
  const g1 = await makeMatch(db, {
    competitionId,
    roundId: groupRound,
    stage: 'GROUP',
    status: 'FINISHED',
    homeTeamCode: 'FRA',
    fullTimeHome: 1,
    fullTimeAway: 0,
    winner: 'HOME',
    kickoffTime: kickoff,
  })
  const g2 = await makeMatch(db, {
    competitionId,
    roundId: groupRound,
    stage: 'GROUP',
    status: 'FINISHED',
    fullTimeHome: 2,
    fullTimeAway: 2,
    winner: 'DRAW',
    kickoffTime: kickoff,
  })
  const final = await makeMatch(db, {
    competitionId,
    roundId: finalRound,
    stage: 'FINAL',
    status: 'FINISHED',
    homeTeamCode: 'FRA',
    fullTimeHome: 2,
    fullTimeAway: 1,
    winner: 'HOME',
    kickoffTime: new Date('2026-07-19T18:00:00Z'),
  })

  const p = async (userId: string, matchId: string, roundIdV: string, total: number, tier: BaseTier) =>
    score(await makePrediction(db, { userId, matchId, roundId: roundIdV, home: 0, away: 0, lockedAt: kickoff }), total, tier)

  // Group: Alice 5 (EXACT+DIFF), Bob 5 (DIFF+EXACT) -> tie; Carol 1.
  await p(alice, g1, groupRound, 3, 'EXACT')
  await p(alice, g2, groupRound, 2, 'DIFF')
  await p(bob, g1, groupRound, 2, 'DIFF')
  await p(bob, g2, groupRound, 3, 'EXACT')
  await p(carol, g1, groupRound, 1, 'OUTCOME')
  await p(carol, g2, groupRound, 0, 'MISS')
  // Final: Alice 3 (EXACT), Bob 0, Carol 2 (DIFF).
  await p(alice, final, finalRound, 3, 'EXACT')
  await p(bob, final, finalRound, 0, 'MISS')
  await p(carol, final, finalRound, 2, 'DIFF')

  return { competitionId, alice, bob }
}

async function awards(competitionId: string) {
  return db.select().from(competitionAward).where(eq(competitionAward.competitionId, competitionId))
}

describe('awardCompetitionTrophies', () => {
  it('awards nothing until the final is decided', async () => {
    const competitionId = await seedCompetition(db)
    const u = await makeUser(db, 'u')
    const groupRound = await roundId(competitionId, 'GROUP', 1)
    const g = await makeMatch(db, {
      competitionId,
      roundId: groupRound,
      stage: 'GROUP',
      status: 'FINISHED',
      fullTimeHome: 1,
      fullTimeAway: 0,
      winner: 'HOME',
      kickoffTime: new Date('2026-06-11T18:00:00Z'),
    })
    await score(await makePrediction(db, { userId: u, matchId: g, roundId: groupRound, home: 1, away: 0 }), 3, 'EXACT')

    const newly = await awardCompetitionTrophies(db, competitionId)
    expect(newly).toHaveLength(0)
    expect(await awards(competitionId)).toHaveLength(0)
  })

  it('awards the five trophies, sharing tied ones', async () => {
    const { competitionId, alice, bob } = await scenario('FRA')
    await awardCompetitionTrophies(db, competitionId)
    const rows = await awards(competitionId)

    const byType = (t: string) => rows.filter((r) => r.type === t)
    expect(byType('OVERALL')).toEqual([expect.objectContaining({ userId: alice, value: 8 })])
    expect(byType('KNOCKOUT_PHASE')).toEqual([expect.objectContaining({ userId: alice, value: 3 })])
    expect(byType('MADAME_IRMA')).toEqual([expect.objectContaining({ userId: alice, value: 2 })])
    expect(byType('TEAM_SPECIALIST')).toEqual([
      expect.objectContaining({ userId: alice, value: 6, teamCode: 'FRA' }),
    ])
    // Group phase is a tie: Alice and Bob both on 5.
    const group = byType('GROUP_PHASE')
    expect(group).toHaveLength(2)
    expect(group.map((r) => r.userId).sort()).toEqual([alice, bob].sort())
    expect(group.every((r) => r.value === 5)).toBe(true)
    expect(rows).toHaveLength(6)
  })

  it('skips the team-specialist trophy when no featured team is set', async () => {
    const { competitionId } = await scenario(null)
    await awardCompetitionTrophies(db, competitionId)
    const rows = await awards(competitionId)
    expect(rows.some((r) => r.type === 'TEAM_SPECIALIST')).toBe(false)
    expect(rows).toHaveLength(5)
  })

  it('is idempotent: re-running awards nothing new and keeps rows stable', async () => {
    const { competitionId } = await scenario('FRA')
    await awardCompetitionTrophies(db, competitionId)
    const first = await awards(competitionId)

    const newly = await awardCompetitionTrophies(db, competitionId)
    const second = await awards(competitionId)
    expect(newly).toHaveLength(0)
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort())
    expect(second.map((r) => r.awardedAt.getTime()).sort()).toEqual(first.map((r) => r.awardedAt.getTime()).sort())
  })

  it('reconciles: a changed result moves the trophy and drops the stale holder', async () => {
    const { competitionId, alice, bob } = await scenario('FRA')
    await awardCompetitionTrophies(db, competitionId)

    // Bob's group predictions jump ahead of Alice: Bob alone now tops the group.
    const bobGroup = await db
      .select({ id: prediction.id })
      .from(prediction)
      .innerJoin(round, eq(round.id, prediction.roundId))
      .where(and(eq(prediction.userId, bob), eq(round.stage, 'GROUP')))
    for (const r of bobGroup) await score(r.id, 10, 'EXACT')

    await awardCompetitionTrophies(db, competitionId)
    const group = (await awards(competitionId)).filter((r) => r.type === 'GROUP_PHASE')
    expect(group).toHaveLength(1)
    expect(group[0]).toEqual(expect.objectContaining({ userId: bob, value: 20 }))
    expect(group.some((r) => r.userId === alice)).toBe(false)
  })

  it('skips a phase trophy when nobody scored in it', async () => {
    const competitionId = await seedCompetition(db)
    const u = await makeUser(db, 'u')
    const finalRound = await roundId(competitionId, 'FINAL')
    const final = await makeMatch(db, {
      competitionId,
      roundId: finalRound,
      stage: 'FINAL',
      status: 'FINISHED',
      fullTimeHome: 2,
      fullTimeAway: 1,
      winner: 'HOME',
      kickoffTime: new Date('2026-07-19T18:00:00Z'),
    })
    // Only a MISS in the (knockout-only) competition: a decided final, but no
    // points anywhere, so no phase trophy is minted.
    await score(await makePrediction(db, { userId: u, matchId: final, roundId: finalRound, home: 0, away: 0 }), 0, 'MISS')

    await awardCompetitionTrophies(db, competitionId)
    expect(await awards(competitionId)).toHaveLength(0)
  })
})

describe('criteriaMatchFilter', () => {
  it('scopes only the phase criteria; whole-competition ones have no filter', () => {
    expect(criteriaMatchFilter('GROUP_PHASE')).toBeDefined()
    expect(criteriaMatchFilter('KNOCKOUT_PHASE')).toBeDefined()
    expect(criteriaMatchFilter('OVERALL')).toBeUndefined()
    expect(criteriaMatchFilter('MADAME_IRMA')).toBeUndefined()
    expect(criteriaMatchFilter('TEAM_SPECIALIST')).toBeUndefined()
  })
})

describe('rankCriteria', () => {
  // scenario('FRA'): Alice 8 overall, Bob 5, Carol 3; group is an Alice/Bob tie on
  // 5; knockout Alice 3 / Carol 2; IRMA Alice 2 exact / Bob 1; FRA subset Alice 6.
  it('ranks OVERALL from the leaderboard, dropping zero-point players', async () => {
    const { competitionId, alice, bob } = await scenario('FRA')
    const rows = await rankCriteria(db, competitionId, 'OVERALL')
    expect(rows.map((r) => [r.userId, r.value, r.rank])).toEqual([
      [alice, 8, 1],
      [bob, 5, 2],
      expect.arrayContaining([3, 3]), // carol third on 3
    ])
  })

  it('shares rank 1 on a tie and skips ahead (1224) for the group phase', async () => {
    const { competitionId, alice, bob } = await scenario('FRA')
    const rows = await rankCriteria(db, competitionId, 'GROUP_PHASE')
    const top = rows.filter((r) => r.rank === 1)
    expect(top.map((r) => r.userId).sort()).toEqual([alice, bob].sort())
    expect(top.every((r) => r.value === 5)).toBe(true)
    // Carol is next, skipped to rank 3.
    expect(rows.find((r) => r.rank === 3)?.value).toBe(1)
  })

  it('ranks MADAME_IRMA by EXACT count, not points', async () => {
    const { competitionId, alice, bob } = await scenario('FRA')
    const rows = await rankCriteria(db, competitionId, 'MADAME_IRMA')
    expect(rows.map((r) => [r.userId, r.value, r.rank])).toEqual([
      [alice, 2, 1],
      [bob, 1, 2],
    ]) // Carol has no EXACT, so she is absent
  })

  it('scopes TEAM_SPECIALIST to the featured team fixtures', async () => {
    const { competitionId, alice } = await scenario('FRA')
    const rows = await rankCriteria(db, competitionId, 'TEAM_SPECIALIST', { teamCode: 'FRA' })
    expect(rows[0]).toMatchObject({ userId: alice, value: 6, rank: 1 })
    expect(rows).toHaveLength(3) // Alice 6, Carol 3, Bob 2 all scored in FRA games
  })

  it('returns no TEAM_SPECIALIST ranking without a featured team', async () => {
    const { competitionId } = await scenario('FRA')
    expect(await rankCriteria(db, competitionId, 'TEAM_SPECIALIST', {})).toEqual([])
  })
})
