import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { league, prediction, round } from '../../../db/schema'
import type { BaseTier } from '../scoring/tiers'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { computeLeagueRewardWinners, rankLeagueCriterion, type LeagueCriteriaOpts } from './criteria'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
})

async function roundId(competitionId: string, stage: string, matchday: number | null = null): Promise<string> {
  const rows = await db.select().from(round).where(eq(round.competitionId, competitionId))
  return rows.find((r) => r.stage === stage && (matchday === null || r.matchday === matchday))!.id
}

async function scored(userId: string, matchId: string, rId: string, tier: BaseTier, points: number) {
  const id = await makePrediction(db, { userId, matchId, roundId: rId, home: 0, away: 0, lockedAt: new Date() })
  await db
    .update(prediction)
    .set({ baseTier: tier, totalPoints: points, basePoints: points, scoredAt: new Date(), scoredAtVersion: 1 })
    .where(eq(prediction.id, id))
}

// Alice, Bob, Carol in one league. Two group matches (g1 involves FRA) and a
// decided final (also FRA). Scores are chosen so each criterion has a clear
// outcome (see the assertions).
async function scenario() {
  const competitionId = await seedCompetition(db)
  const groupRound = await roundId(competitionId, 'GROUP', 1)
  const finalRound = await roundId(competitionId, 'FINAL')
  const alice = await makeUser(db, 'alice')
  const bob = await makeUser(db, 'bob')
  const carol = await makeUser(db, 'carol')
  const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
  await addLeagueMember(db, leagueId, bob, 'MEMBER')
  await addLeagueMember(db, leagueId, carol, 'MEMBER')

  const kickoff = new Date('2026-06-11T12:00:00Z')
  const g1 = await makeMatch(db, { competitionId, roundId: groupRound, stage: 'GROUP', status: 'FINISHED', homeTeamCode: 'FRA', fullTimeHome: 1, fullTimeAway: 0, winner: 'HOME', kickoffTime: kickoff })
  const g2 = await makeMatch(db, { competitionId, roundId: groupRound, stage: 'GROUP', status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 2, winner: 'DRAW', kickoffTime: kickoff })
  const final = await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', status: 'FINISHED', homeTeamCode: 'FRA', fullTimeHome: 2, fullTimeAway: 1, winner: 'HOME', kickoffTime: new Date('2026-07-19T18:00:00Z') })

  // alice: 8 pts, 2 exact (g1,final), 3 outcome, 3 gd. bob: 5 pts, 1 exact (g2), 2
  // outcome, 2 gd. carol: 3 pts, 0 exact, 2 outcome, 1 gd (lowest total).
  await scored(alice, g1, groupRound, 'EXACT', 3)
  await scored(alice, g2, groupRound, 'DIFF', 2)
  await scored(alice, final, finalRound, 'EXACT', 3)
  await scored(bob, g1, groupRound, 'DIFF', 2)
  await scored(bob, g2, groupRound, 'EXACT', 3)
  await scored(bob, final, finalRound, 'MISS', 0)
  await scored(carol, g1, groupRound, 'OUTCOME', 1)
  await scored(carol, g2, groupRound, 'MISS', 0)
  await scored(carol, final, finalRound, 'DIFF', 2)

  const memberIds = [alice, bob, carol]
  const opts = (featuredTeamCode: string | null = null): LeagueCriteriaOpts => ({ leagueId, memberIds, featuredTeamCode })
  return { competitionId, leagueId, alice, bob, carol, opts }
}

describe('computeLeagueRewardWinners', () => {
  it('derives each criterion winner from the members', async () => {
    const { competitionId, alice, bob, carol, opts } = await scenario()
    const winners = await computeLeagueRewardWinners(db, competitionId, opts('FRA'))
    const by = (t: string) =>
      winners
        .filter((w) => w.type === t)
        .map((w) => [w.userId, w.value])
        .sort()

    expect(by('OVERALL')).toEqual([[alice, 8]])
    expect(by('WOODEN_SPOON')).toEqual([[carol, 3]]) // fewest points
    expect(by('GROUP_PHASE')).toEqual([[alice, 5], [bob, 5]].sort()) // 5-5 tie
    expect(by('KNOCKOUT_PHASE')).toEqual([[alice, 3]])
    expect(by('FINALIST')).toEqual([[alice, 3]])
    expect(by('MADAME_IRMA')).toEqual([[alice, 2]])
    expect(by('GROUP_ORACLE')).toEqual([[alice, 1], [bob, 1]].sort()) // one group exact each
    expect(by('KNOCKOUT_ORACLE')).toEqual([[alice, 1]])
    expect(by('SHARPSHOOTER')).toEqual([[alice, 3]]) // most correct outcomes
    expect(by('GOAL_DIFF_GURU')).toEqual([[alice, 3]])
    // TEAM_SPECIALIST: alice called exact on both FRA games (g1 + final) = 2.
    expect(by('TEAM_SPECIALIST')).toEqual([[alice, 2]])
  })

  it('omits TEAM_SPECIALIST when the league has no featured team', async () => {
    const { competitionId, opts } = await scenario()
    const winners = await computeLeagueRewardWinners(db, competitionId, opts(null))
    expect(winners.some((w) => w.type === 'TEAM_SPECIALIST')).toBe(false)
  })
})

describe('rankLeagueCriterion', () => {
  it('ranks OVERALL off the leaderboard', async () => {
    const { competitionId, alice, bob, carol, opts } = await scenario()
    const rows = await rankLeagueCriterion(db, competitionId, 'OVERALL', opts())
    expect(rows.map((r) => [r.userId, r.value, r.rank])).toEqual([
      [alice, 8, 1],
      [bob, 5, 2],
      [carol, 3, 3],
    ])
  })

  it('ranks WOODEN_SPOON ascending, the lowest first', async () => {
    const { competitionId, alice, bob, carol, opts } = await scenario()
    const rows = await rankLeagueCriterion(db, competitionId, 'WOODEN_SPOON', opts())
    expect(rows.map((r) => [r.userId, r.value, r.rank])).toEqual([
      [carol, 3, 1],
      [bob, 5, 2],
      [alice, 8, 3],
    ])
  })

  it('ranks SHARPSHOOTER on the outcome count, ties sharing a rank', async () => {
    const { competitionId, alice, bob, carol, opts } = await scenario()
    const rows = await rankLeagueCriterion(db, competitionId, 'SHARPSHOOTER', opts())
    expect(rows[0]).toMatchObject({ userId: alice, value: 3, rank: 1 })
    // Bob and Carol both on 2 correct outcomes share rank 2.
    expect(rows.filter((r) => r.rank === 2).map((r) => r.userId).sort()).toEqual([bob, carol].sort())
    expect(rows.filter((r) => r.rank === 2).every((r) => r.value === 2)).toBe(true)
  })

  it('ranks GOAL_DIFF_GURU on the goal-difference count', async () => {
    const { competitionId, alice, bob, carol, opts } = await scenario()
    const rows = await rankLeagueCriterion(db, competitionId, 'GOAL_DIFF_GURU', opts())
    expect(rows.map((r) => [r.userId, r.value, r.rank])).toEqual([
      [alice, 3, 1],
      [bob, 2, 2],
      [carol, 1, 3],
    ])
  })

  it('ranks FINALIST on final-match points, dropping non-scorers', async () => {
    const { competitionId, alice, carol, bob, opts } = await scenario()
    const rows = await rankLeagueCriterion(db, competitionId, 'FINALIST', opts())
    expect(rows.map((r) => [r.userId, r.value, r.rank])).toEqual([
      [alice, 3, 1],
      [carol, 2, 2],
    ])
    expect(rows.some((r) => r.userId === bob)).toBe(false) // bob missed the final
  })

  it('returns no TEAM_SPECIALIST ranking without a featured team, else ranks by exact count', async () => {
    const { competitionId, leagueId, alice, opts } = await scenario()
    expect(await rankLeagueCriterion(db, competitionId, 'TEAM_SPECIALIST', opts(null))).toEqual([])

    await db.update(league).set({ featuredTeamCode: 'FRA' }).where(eq(league.id, leagueId))
    const rows = await rankLeagueCriterion(db, competitionId, 'TEAM_SPECIALIST', opts('FRA'))
    expect(rows).toEqual([expect.objectContaining({ userId: alice, value: 2, rank: 1 })])
  })
})
