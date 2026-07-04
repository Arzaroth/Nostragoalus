import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { competition, leagueMember, leagueReward, match, prediction, round, user } from '../../../db/schema'
import type { BaseTier } from '../scoring/tiers'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getMyRewards, getRewardRanking, getRewardStandings, listLeagueRewards, setLeagueRewards } from './service'

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
  it('lists held (youHold) and chased (tentative) prizes, held first', async () => {
    const { leagueId, alice, bob } = await scenario()
    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: 'Un magnum', imageKey: 'reward/z.webp' }])

    // Alice leads OVERALL, so she holds the one configured prize.
    const mine = await getMyRewards(db, alice)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({
      leagueId,
      type: 'OVERALL',
      youHold: true,
      reward: { type: 'OVERALL', label: 'Un magnum', imageUrl: '/api/media/reward/z.webp' },
    })

    // Bob is a member chasing the same prize: it shows tentative (youHold false).
    const bobs = await getMyRewards(db, bob)
    expect(bobs).toHaveLength(1)
    expect(bobs[0]).toMatchObject({ type: 'OVERALL', youHold: false })
  })

  it('sorts prizes the user holds ahead of ones they are chasing', async () => {
    const { leagueId, alice } = await scenario()
    // Alice holds OVERALL but not the group phase (Alice+Bob tie is broken by the
    // ladder toward Alice on OVERALL only); configure both so she has one of each.
    await setLeagueRewards(db, leagueId, [
      { type: 'OVERALL', label: 'Magnum' },
      { type: 'KNOCKOUT_PHASE', label: 'Trophy' },
    ])
    const mine = await getMyRewards(db, alice)
    expect(mine).toHaveLength(2)
    // Held (OVERALL) sorts before the chased knockout prize (nobody scored a KO).
    expect(mine[0].youHold).toBe(true)
    expect(mine[1].youHold).toBe(false)
  })
})

// A team-specialist scenario: FRA is the featured team and the single scored
// match involves FRA, so Alice leads the team subset.
async function teamScenario() {
  const competitionId = await seedCompetition(db)
  await db.update(competition).set({ featuredTeamCode: 'FRA' }).where(eq(competition.id, competitionId))
  const g1 = await groupRound(competitionId)
  // Distinct ids so a test may build a plain scenario() alongside this one.
  const alice = await makeUser(db, 'talice')
  const bob = await makeUser(db, 'tbob')
  const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
  await addLeagueMember(db, leagueId, bob, 'MEMBER')
  const m = await makeMatch(db, {
    competitionId,
    roundId: g1,
    stage: 'GROUP',
    status: 'FINISHED',
    homeTeamCode: 'FRA',
    fullTimeHome: 1,
    fullTimeAway: 0,
    winner: 'HOME',
    kickoffTime: new Date('2026-06-11T12:00:00Z'),
  })
  await scoredPred(alice, m, g1, 'EXACT', 3)
  await scoredPred(bob, m, g1, 'DIFF', 2)
  return { competitionId, leagueId, alice, bob }
}

describe('getRewardStandings team-specialist gating', () => {
  it('disables TEAM_SPECIALIST with no featured team, enables it with one', async () => {
    const plain = await scenario()
    const off = (await getRewardStandings(db, plain.leagueId, plain.alice)).find((s) => s.type === 'TEAM_SPECIALIST')!
    expect(off.disabled).toBe(true)
    expect(off.teamCode).toBeNull()

    const team = await teamScenario()
    const on = (await getRewardStandings(db, team.leagueId, team.alice)).find((s) => s.type === 'TEAM_SPECIALIST')!
    expect(on.disabled).toBe(false)
    expect(on.teamCode).toBe('FRA')
    expect(on.youHold).toBe(true) // Alice leads the FRA subset
  })
})

describe('getRewardRanking', () => {
  it('ranks a criterion among members and flags the viewer', async () => {
    const { leagueId, alice, bob } = await scenario()
    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: 'Magnum' }])

    const ranking = await getRewardRanking(db, leagueId, 'OVERALL', bob)
    expect(ranking.metric).toBe('points')
    expect(ranking.reward?.label).toBe('Magnum')
    expect(ranking.rows.map((r) => [r.displayName, r.value, r.rank, r.isViewer])).toEqual([
      ['alice', 3, 1, false],
      ['bob', 2, 2, true],
    ])
  })

  it('reads MADAME_IRMA on the EXACT metric', async () => {
    const { leagueId, alice } = await scenario()
    const ranking = await getRewardRanking(db, leagueId, 'MADAME_IRMA', alice)
    expect(ranking.metric).toBe('exact')
    // Alice has the only EXACT; Bob (DIFF) drops out of the exact ranking.
    expect(ranking.rows).toHaveLength(1)
    expect(ranking.rows[0]).toMatchObject({ userId: alice, value: 1, rank: 1 })
  })

  it('returns an empty TEAM_SPECIALIST ranking when no featured team is set', async () => {
    const { leagueId, alice } = await scenario()
    const ranking = await getRewardRanking(db, leagueId, 'TEAM_SPECIALIST', alice)
    expect(ranking.teamCode).toBeNull()
    expect(ranking.rows).toEqual([])
  })

  it('names the TEAM_SPECIALIST ranking by the featured team', async () => {
    const { leagueId, alice } = await teamScenario()
    const ranking = await getRewardRanking(db, leagueId, 'TEAM_SPECIALIST', alice)
    expect(ranking.teamCode).toBe('FRA')
    expect(ranking.rows[0]).toMatchObject({ userId: alice, rank: 1 })
  })

  it('blanks a concealed member row for a non-member viewer', async () => {
    const { leagueId, alice } = await scenario()
    const outsider = await makeUser(db, 'outsider')
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, alice))
    const ranking = await getRewardRanking(db, leagueId, 'OVERALL', outsider)
    const aliceRow = ranking.rows.find((r) => r.userId === alice)!
    expect(aliceRow.displayName).toBe('')
    expect(aliceRow.image).toBeNull()
  })

  it('is empty for a memberless league and throws for an unknown one', async () => {
    const competitionId = await seedCompetition(db)
    const owner = await makeUser(db, 'owner')
    const leagueId = await makeLeague(db, { competitionId, ownerId: owner })
    await db.delete(leagueMember).where(eq(leagueMember.leagueId, leagueId))
    expect((await getRewardRanking(db, leagueId, 'OVERALL', null)).rows).toEqual([])
    await expect(getRewardRanking(db, 'nope', 'OVERALL', null)).rejects.toThrow()
  })
})
