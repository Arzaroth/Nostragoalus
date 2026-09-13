import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from './rounds'
import { makeMatch, seedCompetition } from '../../../tests/factories'
import { syncMatchDetails } from './details'
import { goalEvent, match } from '../../../db/schema'
import type { MatchDataProvider } from '../providers/types'
import type { MatchDetail } from '../../../shared/types/match'

function providerWith(detail: MatchDetail | null): MatchDataProvider {
  return {
    meta: { name: 'x', rateLimitPerMin: 60, dailyCap: null },
    listFixtures: async () => [],
    getMatchesByDate: async () => [],
    getLiveMatches: async () => [],
    getMatchDetail: async () => detail,
  }
}

const DETAIL: MatchDetail = {
  possessionHome: 40,
  possessionAway: 60,
  goals: [
    {
      side: 'AWAY',
      teamId: 'A',
      teamName: 'Ecuador',
      teamCode: 'ECU',
      playerId: 'a1',
      playerName: 'Valencia',
      minute: "16'",
      goalType: 1,
      ownGoal: false,
      assistPlayerId: null,
      assistPlayerName: null,
    },
  ],
}

describe('syncMatchDetails', () => {
  it('stores goals + possession for finished matches and is idempotent', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const mid = await makeMatch(db, {
      competitionId,
      roundId: md1,
      kickoffTime: new Date('2026-06-11T16:00:00Z'),
      status: 'FINISHED',
      fullTimeHome: 0,
      fullTimeAway: 2,
    })
    await db.update(match).set({ providerStageId: 'st1' }).where(eq(match.id, mid))

    const res = await syncMatchDetails(db, competitionId, providerWith(DETAIL))
    expect(res).toMatchObject({ fetched: 1, goals: 1 })
    expect(await db.select().from(goalEvent)).toHaveLength(1)
    const row = (await db.select().from(match).where(eq(match.id, mid)))[0]
    expect(Number(row.possessionHome)).toBe(40)
    expect(row.detailsFetchedAt).not.toBeNull()

    const again = await syncMatchDetails(db, competitionId, providerWith(DETAIL))
    expect(again.fetched).toBe(0)
    expect(await db.select().from(goalEvent)).toHaveLength(1)
    await client.close()
  })

  it('skips a match when detail is null or the provider throws', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const mid = await makeMatch(db, {
      competitionId,
      roundId: md1,
      kickoffTime: new Date('2026-06-11T16:00:00Z'),
      status: 'FINISHED',
      fullTimeHome: 0,
      fullTimeAway: 0,
    })
    await db.update(match).set({ providerStageId: 's' }).where(eq(match.id, mid))

    expect((await syncMatchDetails(db, competitionId, providerWith(null))).skipped).toBe(1)

    const throwing: MatchDataProvider = {
      ...providerWith(DETAIL),
      getMatchDetail: async () => {
        throw new Error('boom')
      },
    }
    expect((await syncMatchDetails(db, competitionId, throwing)).skipped).toBe(1)
    expect(await db.select().from(goalEvent)).toHaveLength(0)
    await client.close()
  })

  it('records a detail with no goals and no possession', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const mid = await makeMatch(db, {
      competitionId,
      roundId: md1,
      kickoffTime: new Date('2026-06-11T16:00:00Z'),
      status: 'FINISHED',
      fullTimeHome: 0,
      fullTimeAway: 0,
    })
    await db.update(match).set({ providerStageId: 's' }).where(eq(match.id, mid))

    const res = await syncMatchDetails(db, competitionId, providerWith({ possessionHome: null, possessionAway: null, goals: [] }))
    expect(res).toMatchObject({ fetched: 1, goals: 0 })
    const row = (await db.select().from(match).where(eq(match.id, mid)))[0]
    expect(row.possessionHome).toBeNull()
    expect(row.detailsFetchedAt).not.toBeNull()
    await client.close()
  })

  it('never replaces stored goals with nothing', async () => {
    // The repair migration puts already-detailed matches back through here. A
    // thin timeline document answers with a non-null detail carrying no goals,
    // and deleting first would wipe the match's scorers for good.
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const mid = await makeMatch(db, {
      competitionId,
      roundId: md1,
      kickoffTime: new Date('2026-06-11T16:00:00Z'),
      status: 'FINISHED',
      fullTimeHome: 0,
      fullTimeAway: 1,
    })
    await db.update(match).set({ providerStageId: 's' }).where(eq(match.id, mid))
    await syncMatchDetails(db, competitionId, providerWith(DETAIL))
    expect((await db.select().from(goalEvent).where(eq(goalEvent.matchId, mid))).length).toBe(1)

    // Re-open it the way the migration does, then answer with an empty detail.
    await db.update(match).set({ detailsFetchedAt: null }).where(eq(match.id, mid))
    const res = await syncMatchDetails(db, competitionId, providerWith({ possessionHome: null, possessionAway: null, goals: [] }))

    expect(res).toMatchObject({ fetched: 1, goals: 0 })
    const kept = await db.select().from(goalEvent).where(eq(goalEvent.matchId, mid))
    expect(kept.map((g) => g.playerName)).toEqual(['Valencia'])
    // Still marked done, so it does not come back round every run.
    expect((await db.select().from(match).where(eq(match.id, mid)))[0].detailsFetchedAt).not.toBeNull()
    await client.close()
  })

  it('returns zeros when the provider exposes no match detail', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const noDetail: MatchDataProvider = {
      meta: { name: 'x', rateLimitPerMin: 1, dailyCap: null },
      listFixtures: async () => [],
      getMatchesByDate: async () => [],
      getLiveMatches: async () => [],
    }
    expect(await syncMatchDetails(db, competitionId, noDetail)).toEqual({ fetched: 0, goals: 0, skipped: 0 })
    await client.close()
  })
})
