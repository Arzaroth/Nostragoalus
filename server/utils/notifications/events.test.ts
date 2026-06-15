import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { createTestDb } from '../../../tests/db'
import { makeCompetition, makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import {
  bestScorerPick,
  championPick,
  league,
  leagueMember,
  prediction,
  userNotification,
  userProfile,
} from '../../../db/schema'
import {
  notifyBestScorerResult,
  notifyChampionResult,
  notifyLeagueJoin,
  notifyMatchResults,
  notifyLeagueRemoved,
  notifyLeagueRole,
} from './events'

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await makeCompetition(ctx.db)
  const owner = await makeUser(ctx.db, 'owner')
  const mod = await makeUser(ctx.db, 'mod')
  const member = await makeUser(ctx.db, 'member')
  const joiner = await makeUser(ctx.db, 'joiner')
  const [lg] = await ctx.db
    .insert(league)
    .values({ competitionId, name: 'Friends', joinCode: 'CODE1234' })
    .returning({ id: league.id })
  await ctx.db.insert(leagueMember).values([
    { leagueId: lg.id, userId: owner, role: 'OWNER' },
    { leagueId: lg.id, userId: mod, role: 'MODERATOR' },
    { leagueId: lg.id, userId: member, role: 'MEMBER' },
  ])
  return { ...ctx, competitionId, leagueId: lg.id, owner, mod, member, joiner }
}

function notifsFor(db: AppDatabase, userId: string) {
  return db.select().from(userNotification).where(eq(userNotification.userId, userId))
}

describe('notifyLeagueJoin', () => {
  it('notifies owner and moderators, not plain members or the joiner', async () => {
    const { db, client, leagueId, owner, mod, member, joiner } = await setup()
    await db.insert(userProfile).values({ userId: joiner, displayName: 'New Person' })
    await notifyLeagueJoin(db, leagueId, joiner)
    const ownerN = await notifsFor(db, owner)
    expect(ownerN).toHaveLength(1)
    expect(ownerN[0]!.type).toBe('LEAGUE_JOIN')
    expect(ownerN[0]!.data).toMatchObject({ leagueName: 'Friends', joinerName: 'New Person' })
    expect(await notifsFor(db, mod)).toHaveLength(1)
    expect(await notifsFor(db, member)).toHaveLength(0)
    expect(await notifsFor(db, joiner)).toHaveLength(0)
    await client.close()
  })

  it('falls back to the user name without a profile, and no-ops without recipients', async () => {
    const { db, client, leagueId, owner, joiner } = await setup()
    await db.delete(leagueMember).where(eq(leagueMember.leagueId, leagueId))
    await notifyLeagueJoin(db, leagueId, joiner)
    expect(await notifsFor(db, owner)).toHaveLength(0)

    await db.insert(leagueMember).values({ leagueId, userId: owner, role: 'OWNER' })
    await notifyLeagueJoin(db, leagueId, joiner)
    const ownerN = await notifsFor(db, owner)
    expect(ownerN).toHaveLength(1)
    expect(ownerN[0]!.data).toMatchObject({ joinerName: 'joiner' })
    await client.close()
  })

  it('no-ops when the league does not exist', async () => {
    const { db, client, owner } = await setup()
    await notifyLeagueJoin(db, 'missing', owner)
    expect(await notifsFor(db, owner)).toHaveLength(0)
    await client.close()
  })
})

describe('notifyLeagueRole', () => {
  it('notifies on promotion to MODERATOR or OWNER', async () => {
    const { db, client, leagueId, member } = await setup()
    await notifyLeagueRole(db, leagueId, member, 'MODERATOR')
    const n = await notifsFor(db, member)
    expect(n).toHaveLength(1)
    expect(n[0]!.data).toMatchObject({ type: 'LEAGUE_ROLE', role: 'MODERATOR', leagueName: 'Friends' })
    await client.close()
  })

  it('is silent on a demotion to MEMBER and when the league is gone', async () => {
    const { db, client, leagueId, member } = await setup()
    await notifyLeagueRole(db, leagueId, member, 'MEMBER')
    await notifyLeagueRole(db, 'missing', member, 'OWNER')
    expect(await notifsFor(db, member)).toHaveLength(0)
    await client.close()
  })
})

describe('notifyLeagueRemoved', () => {
  it('notifies the removed user and no-ops when the league is gone', async () => {
    const { db, client, leagueId, member } = await setup()
    await notifyLeagueRemoved(db, leagueId, member)
    expect(await notifsFor(db, member)).toHaveLength(1)
    await notifyLeagueRemoved(db, 'missing', member)
    expect(await notifsFor(db, member)).toHaveLength(1)
    await client.close()
  })
})

describe('notifyMatchResults', () => {
  async function matchSetup() {
    const ctx = await createTestDb()
    const competitionId = await seedCompetition(ctx.db)
    const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
    const exact = await makeUser(ctx.db, 'pexact')
    const miss = await makeUser(ctx.db, 'pmiss')
    const unscored = await makeUser(ctx.db, 'punscored')
    const matchId = await makeMatch(ctx.db, {
      competitionId,
      roundId,
      kickoffTime: new Date('2026-06-01T00:00:00Z'),
      homeTeam: 'Brazil',
      homeTeamCode: 'BRA',
      awayTeam: 'Argentina',
      awayTeamCode: 'ARG',
      fullTimeHome: 2,
      fullTimeAway: 1,
      status: 'FINISHED',
    })
    await ctx.db.insert(prediction).values([
      { userId: exact, matchId, roundId, homeGoals: 2, awayGoals: 1, totalPoints: 5 },
      { userId: miss, matchId, roundId, homeGoals: 0, awayGoals: 0, totalPoints: 0 },
      { userId: unscored, matchId, roundId, homeGoals: 1, awayGoals: 1, totalPoints: null },
    ])
    return { ...ctx, competitionId, roundId, matchId, exact, miss, unscored }
  }

  it('notifies every scored predictor with the scoreline and points, skips unscored, dedupes', async () => {
    const { db, client, matchId, exact, miss, unscored } = await matchSetup()
    await notifyMatchResults(db, matchId)
    const e = await notifsFor(db, exact)
    expect(e).toHaveLength(1)
    expect(e[0]!.data).toMatchObject({
      type: 'MATCH_RESULT',
      homeTeam: 'Brazil',
      awayTeam: 'Argentina',
      homeScore: 2,
      awayScore: 1,
      points: 5,
    })
    expect((await notifsFor(db, miss))[0]!.data).toMatchObject({ points: 0 })
    expect(await notifsFor(db, unscored)).toHaveLength(0)
    await notifyMatchResults(db, matchId)
    expect(await notifsFor(db, exact)).toHaveLength(1)
    await client.close()
  })

  it('no-ops on an unknown match', async () => {
    const { db, client, exact } = await matchSetup()
    await notifyMatchResults(db, 'missing')
    expect(await notifsFor(db, exact)).toHaveLength(0)
    await client.close()
  })

  it('defaults a null scoreline to 0', async () => {
    const ctx = await createTestDb()
    const competitionId = await seedCompetition(ctx.db)
    const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
    const u = await makeUser(ctx.db, 'pnull')
    const matchId = await makeMatch(ctx.db, {
      competitionId,
      roundId,
      kickoffTime: new Date('2026-06-01T00:00:00Z'),
      status: 'FINISHED',
    })
    await ctx.db.insert(prediction).values({ userId: u, matchId, roundId, homeGoals: 0, awayGoals: 0, totalPoints: 1 })
    await notifyMatchResults(ctx.db, matchId)
    expect((await notifsFor(ctx.db, u))[0]!.data).toMatchObject({ homeScore: 0, awayScore: 0, points: 1 })
    await ctx.client.close()
  })
})

describe('notifyChampionResult', () => {
  it('notifies winners with their points and dedupes across ticks', async () => {
    const { db, client, competitionId } = await setup()
    const winner = await makeUser(db, 'cw1')
    const loser = await makeUser(db, 'cl1')
    await db.insert(championPick).values([
      { userId: winner, competitionId, teamCode: 'BRA', teamName: 'Brazil', potentialPoints: 40, awardedPoints: 40 },
      { userId: loser, competitionId, teamCode: 'ARG', teamName: 'Argentina', potentialPoints: 20, awardedPoints: 0 },
    ])
    await notifyChampionResult(db, competitionId, 'BRA')
    const n = await notifsFor(db, winner)
    expect(n).toHaveLength(1)
    expect(n[0]!.data).toMatchObject({ type: 'CHAMPION_RESULT', teamName: 'Brazil', points: 40, won: true })
    expect(await notifsFor(db, loser)).toHaveLength(0)
    await notifyChampionResult(db, competitionId, 'BRA')
    expect(await notifsFor(db, winner)).toHaveLength(1)
    await client.close()
  })

  it('no-ops on a null winner or unknown competition', async () => {
    const { db, client, competitionId, owner } = await setup()
    await db
      .insert(championPick)
      .values({ userId: owner, competitionId, teamCode: 'BRA', teamName: 'Brazil', potentialPoints: 40, awardedPoints: 40 })
    await notifyChampionResult(db, competitionId, null)
    await notifyChampionResult(db, 'missing', 'BRA')
    expect(await notifsFor(db, owner)).toHaveLength(0)
    await client.close()
  })
})

describe('notifyBestScorerResult', () => {
  it('notifies pickers of a top scorer and dedupes', async () => {
    const { db, client, competitionId } = await setup()
    const winner = await makeUser(db, 'bw1')
    await db
      .insert(bestScorerPick)
      .values({ userId: winner, competitionId, playerId: 'p9', playerName: 'Striker', teamName: 'Brazil', awardedPoints: 10 })
    await notifyBestScorerResult(db, competitionId, ['p9'])
    const n = await notifsFor(db, winner)
    expect(n).toHaveLength(1)
    expect(n[0]!.data).toMatchObject({ type: 'BEST_SCORER_RESULT', playerName: 'Striker', points: 10, won: true })
    await notifyBestScorerResult(db, competitionId, ['p9'])
    expect(await notifsFor(db, winner)).toHaveLength(1)
    await client.close()
  })

  it('no-ops on empty winners or unknown competition', async () => {
    const { db, client, competitionId, owner } = await setup()
    await db
      .insert(bestScorerPick)
      .values({ userId: owner, competitionId, playerId: 'p9', playerName: 'Striker', teamName: 'Brazil', awardedPoints: 10 })
    await notifyBestScorerResult(db, competitionId, [])
    await notifyBestScorerResult(db, 'missing', ['p9'])
    expect(await notifsFor(db, owner)).toHaveLength(0)
    await client.close()
  })
})
