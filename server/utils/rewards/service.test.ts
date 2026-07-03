import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { leagueMember, leagueReward, match, prediction, round, user } from '../../../db/schema'
import type { BaseTier } from '../scoring/tiers'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getMyRewards, getRewardStandings, listLeagueRewards, setLeagueRewards } from './service'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
})

async function groupRound(competitionId: string): Promise<string> {
  const rows = await db.select().from(round).where(eq(round.competitionId, competitionId))
  return rows.find((r) => r.stage === 'GROUP' && r.matchday === 1)!.id
}

async function scoredPred(userId: string, matchId: string, roundId: string, tier: BaseTier, points: number) {
  const id = await makePrediction(db, { userId, matchId, roundId, home: 0, away: 0, lockedAt: new Date() })
  await db
    .update(prediction)
    .set({ baseTier: tier, totalPoints: points, basePoints: points, scoredAt: new Date(), scoredAtVersion: 1 })
    .where(eq(prediction.id, id))
}

// A league (alice owner, bob member) where alice leads on a single scored group match.
async function scenario() {
  const competitionId = await seedCompetition(db)
  const g1 = await groupRound(competitionId)
  const alice = await makeUser(db, 'alice')
  const bob = await makeUser(db, 'bob')
  const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
  await addLeagueMember(db, leagueId, bob, 'MEMBER')
  const m = await makeMatch(db, {
    competitionId,
    roundId: g1,
    stage: 'GROUP',
    status: 'FINISHED',
    fullTimeHome: 1,
    fullTimeAway: 0,
    winner: 'HOME',
    kickoffTime: new Date('2026-06-11T12:00:00Z'),
  })
  await scoredPred(alice, m, g1, 'EXACT', 3)
  await scoredPred(bob, m, g1, 'DIFF', 2)
  return { competitionId, leagueId, alice, bob }
}

describe('league reward config', () => {
  it('creates, updates, keeps/clears the image, and deletes on a blank label', async () => {
    const { leagueId } = await scenario()

    await setLeagueRewards(db, leagueId, [
      { type: 'OVERALL', label: 'Un jeroboam de rosé', imageKey: 'reward/abc.webp', note: 'At the seminar', link: 'https://x' },
    ])
    let list = await listLeagueRewards(db, leagueId)
    expect(list).toEqual([
      { type: 'OVERALL', label: 'Un jeroboam de rosé', imageUrl: '/api/media/reward/abc.webp', note: 'At the seminar', link: 'https://x' },
    ])

    // Update label, image omitted -> kept.
    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: 'A magnum instead' }])
    list = await listLeagueRewards(db, leagueId)
    expect(list[0]).toMatchObject({ label: 'A magnum instead', imageUrl: '/api/media/reward/abc.webp' })

    // Clear the image explicitly.
    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: 'A magnum instead', imageKey: null }])
    expect((await listLeagueRewards(db, leagueId))[0].imageUrl).toBeNull()

    // Blank label deletes the prize.
    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: '   ' }])
    expect(await db.select().from(leagueReward).where(eq(leagueReward.leagueId, leagueId))).toHaveLength(0)
  })
})

describe('getRewardStandings', () => {
  it('returns each criterion with its prize, current league winner, and youHold', async () => {
    const { leagueId, alice, bob } = await scenario()
    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: 'Un magnum' }])

    const forAlice = await getRewardStandings(db, leagueId, alice)
    expect(forAlice).toHaveLength(5)
    const overall = forAlice.find((s) => s.type === 'OVERALL')!
    expect(overall.reward?.label).toBe('Un magnum')
    expect(overall.winners.map((w) => w.userId)).toEqual([alice])
    expect(overall.winners[0].displayName).toBe('alice')
    expect(overall.youHold).toBe(true)
    // A type with no configured prize still lists, reward null.
    expect(forAlice.find((s) => s.type === 'KNOCKOUT_PHASE')?.reward).toBeNull()

    // Bob leads nothing here, so he holds nothing.
    const forBob = await getRewardStandings(db, leagueId, bob)
    expect(forBob.find((s) => s.type === 'OVERALL')?.youHold).toBe(false)
  })

  it('handles an empty league (no members, no winners)', async () => {
    const competitionId = await seedCompetition(db)
    const owner = await makeUser(db, 'owner')
    const leagueId = await makeLeague(db, { competitionId, ownerId: owner })
    // makeLeague adds the owner as a member; drop it so the league is truly
    // memberless and the no-members short-circuit (winners = []) is exercised.
    await db.delete(leagueMember).where(eq(leagueMember.leagueId, leagueId))
    const standings = await getRewardStandings(db, leagueId, null)
    expect(standings).toHaveLength(5)
    expect(standings.every((s) => s.winners.length === 0)).toBe(true)
    expect(standings.every((s) => s.youHold === false)).toBe(true) // viewer null
  })

  it('hides a private leader from a non-member and admin-hidden from everyone', async () => {
    const { leagueId, alice, bob } = await scenario() // alice leads OVERALL among members
    const outsider = await makeUser(db, 'outsider')

    // A fellow member still sees the private leader's name.
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, alice))
    const forMember = await getRewardStandings(db, leagueId, bob)
    expect(forMember.find((s) => s.type === 'OVERALL')?.winners[0]?.displayName).not.toBe('')

    // A non-member (public-league browse) gets the leader masked, not the name.
    const forOutsider = await getRewardStandings(db, leagueId, outsider)
    const overall = forOutsider.find((s) => s.type === 'OVERALL')
    expect(overall?.winners.length).toBe(1) // the leader still occupies the slot
    expect(overall?.winners[0]?.displayName).toBe('')

    // Admin-hidden is concealed even from a fellow member.
    await db.update(user).set({ profilePrivate: false, hiddenFromLeaderboard: true }).where(eq(user.id, alice))
    const bobView = await getRewardStandings(db, leagueId, bob)
    expect(bobView.find((s) => s.type === 'OVERALL')?.winners[0]?.displayName).toBe('')
    // The leader sees their own name regardless.
    const selfView = await getRewardStandings(db, leagueId, alice)
    expect(selfView.find((s) => s.type === 'OVERALL')?.winners[0]?.displayName).not.toBe('')
  })

  it('throws for an unknown league', async () => {
    await expect(getRewardStandings(db, 'nope', null)).rejects.toThrow()
  })
})

describe('getMyRewards', () => {
  it('lists the prizes the user currently holds across their leagues', async () => {
    const { leagueId, alice, bob } = await scenario()
    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: 'Un magnum', imageKey: 'reward/z.webp' }])

    const mine = await getMyRewards(db, alice)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ leagueId, reward: { type: 'OVERALL', label: 'Un magnum', imageUrl: '/api/media/reward/z.webp' } })

    // Bob holds no prize.
    expect(await getMyRewards(db, bob)).toHaveLength(0)
  })
})
