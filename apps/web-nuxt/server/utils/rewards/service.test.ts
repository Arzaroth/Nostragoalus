import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { league, leagueMember, leagueReward, match, prediction, round, user } from '../../../db/schema'
import type { BaseTier } from '../scoring/tiers'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { getMyRewards, getRewardRanking, getRewardStandings, getRewardWinnersExport, listLeagueRewards, setLeagueRewards } from './service'

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
    expect(forAlice).toHaveLength(11)
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
    expect(standings).toHaveLength(11)
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

  it('omits a disabled TEAM_SPECIALIST prize (no featured team) from the cabinet', async () => {
    const { leagueId, alice } = await scenario() // no featuredTeamCode
    await setLeagueRewards(db, leagueId, [
      { type: 'OVERALL', label: 'Magnum' },
      { type: 'TEAM_SPECIALIST', label: 'Boot' },
    ])
    const mine = await getMyRewards(db, alice)
    expect(mine.map((r) => r.type)).toEqual(['OVERALL'])
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
  const g1 = await groupRound(competitionId)
  // Distinct ids so a test may build a plain scenario() alongside this one.
  const alice = await makeUser(db, 'talice')
  const bob = await makeUser(db, 'tbob')
  const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
  // The featured team is now per-league (drives the TEAM_SPECIALIST prize).
  await db.update(league).set({ featuredTeamCode: 'FRA' }).where(eq(league.id, leagueId))
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

  it('names the TEAM_SPECIALIST ranking by the featured team and reads on the EXACT metric', async () => {
    const { leagueId, alice } = await teamScenario()
    const ranking = await getRewardRanking(db, leagueId, 'TEAM_SPECIALIST', alice)
    expect(ranking.teamCode).toBe('FRA')
    expect(ranking.metric).toBe('exact')
    // Only Alice called an exact on FRA (Bob's DIFF drops out); value = her exact count.
    expect(ranking.rows).toEqual([expect.objectContaining({ userId: alice, value: 1, rank: 1 })])
  })

  it('holds TEAM_SPECIALIST for every member with an exact, ranked and sorted by count', async () => {
    const competitionId = await seedCompetition(db)
    const g1 = await groupRound(competitionId)
    const alice = await makeUser(db, 'ta')
    const bob = await makeUser(db, 'tb')
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await db.update(league).set({ featuredTeamCode: 'FRA' }).where(eq(league.id, leagueId))
    await addLeagueMember(db, leagueId, bob, 'MEMBER')
    const fra1 = await makeMatch(db, { competitionId, roundId: g1, stage: 'GROUP', status: 'FINISHED', homeTeamCode: 'FRA', fullTimeHome: 1, fullTimeAway: 0, winner: 'HOME', kickoffTime: new Date('2026-06-11T12:00:00Z') })
    const fra2 = await makeMatch(db, { competitionId, roundId: g1, stage: 'GROUP', status: 'FINISHED', homeTeamCode: 'FRA', fullTimeHome: 2, fullTimeAway: 0, winner: 'HOME', kickoffTime: new Date('2026-06-12T12:00:00Z') })
    // Alice: 2 exacts on FRA. Bob: 1 exact. Both hold the prize.
    await scoredPred(alice, fra1, g1, 'EXACT', 3)
    await scoredPred(alice, fra2, g1, 'EXACT', 3)
    await scoredPred(bob, fra1, g1, 'EXACT', 3)
    await scoredPred(bob, fra2, g1, 'DIFF', 2)

    const ts = (await getRewardStandings(db, leagueId, bob)).find((s) => s.type === 'TEAM_SPECIALIST')!
    expect(ts.disabled).toBe(false)
    expect(ts.youHold).toBe(true) // Bob holds it too, not just the top holder
    expect(ts.value).toBe(2) // the top holder's exact count
    // Winners sorted by count desc, so the card shows Alice first then "+N others".
    expect(ts.winners.map((w) => w.displayName)).toEqual(['ta', 'tb'])

    const ranking = await getRewardRanking(db, leagueId, 'TEAM_SPECIALIST', bob)
    expect(ranking.rows.map((r) => [r.displayName, r.value, r.rank])).toEqual([
      ['ta', 2, 1],
      ['tb', 1, 2],
    ])
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

describe('getRewardWinnersExport', () => {
  it('exports a row per holder with their email, only for criteria carrying a prize', async () => {
    const { leagueId, alice } = await scenario()
    await setLeagueRewards(db, leagueId, [
      { type: 'OVERALL', label: 'Un magnum' },
      { type: 'MADAME_IRMA', label: 'A crystal ball' },
    ])

    const out = await getRewardWinnersExport(db, leagueId, alice)
    expect(out.leagueName).toBe('Test League')
    // Alice leads both; Bob (DIFF only) holds neither, and the nine criteria with
    // no prize contribute nothing.
    expect(out.rows).toEqual([
      { type: 'OVERALL', prizeLabel: 'Un magnum', teamCode: null, metric: 'points', userId: alice, displayName: 'alice', email: 'alice@example.com', value: 3 },
      { type: 'MADAME_IRMA', prizeLabel: 'A crystal ball', teamCode: null, metric: 'exact', userId: alice, displayName: 'alice', email: 'alice@example.com', value: 1 },
    ])
  })

  it('exports every TEAM_SPECIALIST holder, top count first, with the featured team', async () => {
    const competitionId = await seedCompetition(db)
    const g1 = await groupRound(competitionId)
    const alice = await makeUser(db, 'xa')
    const bob = await makeUser(db, 'xb')
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await db.update(league).set({ featuredTeamCode: 'FRA' }).where(eq(league.id, leagueId))
    await addLeagueMember(db, leagueId, bob, 'MEMBER')
    const fra1 = await makeMatch(db, { competitionId, roundId: g1, stage: 'GROUP', status: 'FINISHED', homeTeamCode: 'FRA', fullTimeHome: 1, fullTimeAway: 0, winner: 'HOME', kickoffTime: new Date('2026-06-11T12:00:00Z') })
    const fra2 = await makeMatch(db, { competitionId, roundId: g1, stage: 'GROUP', status: 'FINISHED', homeTeamCode: 'FRA', fullTimeHome: 2, fullTimeAway: 0, winner: 'HOME', kickoffTime: new Date('2026-06-12T12:00:00Z') })
    await scoredPred(alice, fra1, g1, 'EXACT', 3)
    await scoredPred(alice, fra2, g1, 'EXACT', 3)
    await scoredPred(bob, fra1, g1, 'EXACT', 3)
    await setLeagueRewards(db, leagueId, [{ type: 'TEAM_SPECIALIST', label: 'A scarf' }])

    const rows = (await getRewardWinnersExport(db, leagueId, alice)).rows.filter((r) => r.type === 'TEAM_SPECIALIST')
    expect(rows.map((r) => [r.displayName, r.email, r.value, r.teamCode])).toEqual([
      ['xa', 'xa@example.com', 2, 'FRA'],
      ['xb', 'xb@example.com', 1, 'FRA'],
    ])
  })

  it('omits a TEAM_SPECIALIST prize that has no featured team to be earned on', async () => {
    const { leagueId, alice } = await scenario()
    await setLeagueRewards(db, leagueId, [{ type: 'TEAM_SPECIALIST', label: 'A scarf' }])
    expect((await getRewardWinnersExport(db, leagueId, alice)).rows).toEqual([])
  })

  it('blanks both the name and the email of a holder the exporter may not identify', async () => {
    const { leagueId, alice, bob } = await scenario() // alice leads OVERALL
    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: 'Un magnum' }])
    await db.update(user).set({ hiddenFromLeaderboard: true }).where(eq(user.id, alice))

    // An email identifies as well as a name, so concealment has to cover both.
    const forBob = (await getRewardWinnersExport(db, leagueId, bob)).rows[0]
    expect(forBob.userId).toBe(alice)
    expect(forBob.displayName).toBe('')
    expect(forBob.email).toBe('')

    // A private profile conceals here even from a fellow member, unlike the board:
    // the exporter is ALWAYS a member, so the board's rule would never fire and the
    // player's own privacy switch would mean nothing on the one route that hands
    // out their address.
    await db.update(user).set({ hiddenFromLeaderboard: false, profilePrivate: true }).where(eq(user.id, alice))
    const stillHidden = (await getRewardWinnersExport(db, leagueId, bob)).rows[0]
    expect(stillHidden.userId).toBe(alice)
    expect(stillHidden.email).toBe('')
    expect(stillHidden.displayName).toBe('')

    // The board keeps its own, looser rule: a fellow member still sees the name.
    const standings = await getRewardStandings(db, leagueId, bob)
    expect(standings.find((s) => s.type === 'OVERALL')?.winners[0]?.displayName).toBe('alice')

    // A holder always sees themselves, private profile or not.
    expect((await getRewardWinnersExport(db, leagueId, alice)).rows[0].email).toBe('alice@example.com')
  })

  it('exports the inverse WOODEN_SPOON criterion, keeping a zero-point holder', async () => {
    const competitionId = await seedCompetition(db)
    const g1 = await groupRound(competitionId)
    const alice = await makeUser(db, 'wa')
    const bob = await makeUser(db, 'wb')
    const leagueId = await makeLeague(db, { competitionId, ownerId: alice })
    await addLeagueMember(db, leagueId, bob, 'MEMBER')
    const m = await makeMatch(db, { competitionId, roundId: g1, stage: 'GROUP', status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0, winner: 'HOME', kickoffTime: new Date('2026-06-11T12:00:00Z') })
    await scoredPred(alice, m, g1, 'EXACT', 3)
    await scoredPred(bob, m, g1, 'MISS', 0)
    await setLeagueRewards(db, leagueId, [{ type: 'WOODEN_SPOON', label: 'A lemon' }])

    // Rank 1 is the LOWEST score, and a zero is a legitimate last place - the one
    // criterion that keeps zero-value rows.
    const rows = (await getRewardWinnersExport(db, leagueId, alice)).rows
    expect(rows.map((r) => [r.type, r.prizeLabel, r.displayName, r.value])).toEqual([['WOODEN_SPOON', 'A lemon', 'wb', 0]])
  })

  it('exports for a moderator, not just the owner', async () => {
    const { leagueId, alice, bob } = await scenario()
    await db.update(leagueMember).set({ role: 'MODERATOR' }).where(eq(leagueMember.userId, bob))
    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: 'Un magnum' }])
    const rows = (await getRewardWinnersExport(db, leagueId, bob)).rows
    expect(rows.map((r) => r.email)).toEqual(['alice@example.com'])
  })

  it('is empty with no prizes configured or no members, and throws for an unknown league', async () => {
    const { leagueId, alice } = await scenario()
    // Members but no prize: nothing to hand over. The league still names itself, so
    // the download keeps its filename rather than falling back to "league".
    const noPrizes = await getRewardWinnersExport(db, leagueId, alice)
    expect(noPrizes.rows).toEqual([])
    expect(noPrizes.leagueName).toBe('Test League')

    await setLeagueRewards(db, leagueId, [{ type: 'OVERALL', label: 'Un magnum' }])
    await db.delete(leagueMember).where(eq(leagueMember.leagueId, leagueId))
    const noMembers = await getRewardWinnersExport(db, leagueId, alice)
    expect(noMembers.rows).toEqual([])
    expect(noMembers.leagueName).toBe('Test League')

    await expect(getRewardWinnersExport(db, 'nope', alice)).rejects.toThrow()
  })
})
