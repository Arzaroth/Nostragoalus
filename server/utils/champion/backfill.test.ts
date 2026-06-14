import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { seedCompetition, makeUser } from '../../../tests/factories'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { championPick } from '../../../db/schema'
import type { FifaRankingProvider } from '../providers/fifa-ranking'
import { backfillChampionRanks } from './backfill'
import { FIFA_RANKING_SNAPSHOT } from './fifa-ranking-snapshot'

async function setup() {
  const ctx = await createTestDb()
  await ensureDefaultScoringConfig(ctx.db)
  const competitionId = await seedCompetition(ctx.db)
  const userId = await makeUser(ctx.db, 'u1')
  return { ...ctx, competitionId, userId }
}

// Default champion tiers: rank <=8 -> 10, <=20 -> 15, <=40 -> 25, else (incl.
// unranked) -> 40. Flat champion bonus is 10.

// A healthy live response: the full bundled table (>= MIN_COMPLETE_RANKS) with
// optional per-team overrides, so the backfill accepts it as the live source.
function liveProvider(overrides: Record<string, number> = {}): FifaRankingProvider {
  const ranks = new Map<string, number>([
    ...Object.entries(FIFA_RANKING_SNAPSHOT.ranks),
    ...Object.entries(overrides),
  ])
  return {
    getLatestScheduleId: async () => 'id',
    getRanks: async () => ranks,
    getLatestRanks: async () => ({ scheduleId: 'id', ranks: new Map() }),
  }
}

// A thin/partial response (too few teams): the backfill must reject it and fall
// back to the bundled snapshot rather than blanking the missing teams.
function thinProvider(ranks: Record<string, number>): FifaRankingProvider {
  return {
    getLatestScheduleId: async () => 'id',
    getRanks: async () => new Map(Object.entries(ranks)),
    getLatestRanks: async () => ({ scheduleId: 'id', ranks: new Map() }),
  }
}

const throwingProvider: FifaRankingProvider = {
  getLatestScheduleId: async () => 'id',
  getRanks: async () => {
    throw new Error('cloudflare blocked')
  },
  getLatestRanks: async () => ({ scheduleId: 'id', ranks: new Map() }),
}

async function insertNullRankPick(
  db: Awaited<ReturnType<typeof setup>>['db'],
  competitionId: string,
  userId: string,
  teamCode: string,
  potentialPoints: number,
) {
  await db
    .insert(championPick)
    .values({ userId, competitionId, teamCode, teamName: teamCode, fifaRank: null, potentialPoints })
}

async function readPick(db: Awaited<ReturnType<typeof setup>>['db'], userId: string) {
  const [row] = await db.select().from(championPick).where(eq(championPick.userId, userId))
  return row
}

describe('backfillChampionRanks', () => {
  it('resolves a real rank from the live fetch and recomputes the tier points', async () => {
    const { db, client, competitionId, userId } = await setup()
    await insertNullRankPick(db, competitionId, userId, 'BRA', 10)

    const result = await backfillChampionRanks(db, liveProvider({ BRA: 30 }))

    expect(result).toEqual({ source: 'live', scanned: 1, changed: 1 })
    expect(await readPick(db, userId)).toMatchObject({ fifaRank: 30, potentialPoints: 25 })
    await client.close()
  })

  it('falls back to the bundled snapshot when the live fetch fails', async () => {
    const { db, client, competitionId, userId } = await setup()
    await insertNullRankPick(db, competitionId, userId, 'ARG', 10)

    const result = await backfillChampionRanks(db, throwingProvider)

    expect(result.source).toBe('snapshot')
    expect(result.scanned).toBe(1)
    // ARG tops the snapshot (rank 1) -> still the <=8 tier (10 pts), but the rank
    // is now recorded, proving the snapshot data was used.
    expect(FIFA_RANKING_SNAPSHOT.ranks.ARG).toBe(1)
    expect(await readPick(db, userId)).toMatchObject({ fifaRank: 1, potentialPoints: 10 })
    await client.close()
  })

  it('gives an unmapped team the catch-all tier and leaves its rank null', async () => {
    const { db, client, competitionId, userId } = await setup()
    await insertNullRankPick(db, competitionId, userId, 'ZZZ', 10)

    const result = await backfillChampionRanks(db, liveProvider({}))

    expect(result).toEqual({ source: 'live', scanned: 1, changed: 1 })
    expect(await readPick(db, userId)).toMatchObject({ fifaRank: null, potentialPoints: 40 })
    await client.close()
  })

  it('records a resolved rank without counting it as changed when the payout is unchanged', async () => {
    const { db, client, competitionId, userId } = await setup()
    // ESP at rank 2 -> <=8 tier (10 pts), which already equals the flat points.
    await insertNullRankPick(db, competitionId, userId, 'ESP', 10)

    const result = await backfillChampionRanks(db, liveProvider({ ESP: 2 }))

    expect(result).toEqual({ source: 'live', scanned: 1, changed: 0 })
    expect(await readPick(db, userId)).toMatchObject({ fifaRank: 2, potentialPoints: 10 })
    await client.close()
  })

  it('leaves an unmapped pick already at the catch-all value untouched (idempotent)', async () => {
    const { db, client, competitionId, userId } = await setup()
    await insertNullRankPick(db, competitionId, userId, 'ZZZ', 40)

    const result = await backfillChampionRanks(db, liveProvider({}))

    expect(result).toEqual({ source: 'live', scanned: 1, changed: 0 })
    expect(await readPick(db, userId)).toMatchObject({ fifaRank: null, potentialPoints: 40 })
    await client.close()
  })

  it('gives a pick with no team code the catch-all tier (no rank to look up)', async () => {
    const { db, client, competitionId, userId } = await setup()
    await db
      .insert(championPick)
      .values({ userId, competitionId, teamCode: null, teamName: 'Winner Group A', fifaRank: null, potentialPoints: 10 })

    const result = await backfillChampionRanks(db, liveProvider({ BRA: 1 }))

    expect(result).toEqual({ source: 'live', scanned: 1, changed: 1 })
    expect(await readPick(db, userId)).toMatchObject({ fifaRank: null, potentialPoints: 40 })
    await client.close()
  })

  it('rejects a thin live response and falls back to the snapshot', async () => {
    const { db, client, competitionId, userId } = await setup()
    await insertNullRankPick(db, competitionId, userId, 'BRA', 10)

    // A truncated live map (1 team) must not be trusted: BRA would otherwise be
    // blanked. Expect the snapshot's BRA rank instead.
    const result = await backfillChampionRanks(db, thinProvider({ ARG: 1 }))

    expect(result.source).toBe('snapshot')
    expect(result.scanned).toBe(1)
    expect(await readPick(db, userId)).toMatchObject({ fifaRank: FIFA_RANKING_SNAPSHOT.ranks.BRA })
    await client.close()
  })

  it('ignores picks that already have a rank', async () => {
    const { db, client, competitionId, userId } = await setup()
    await db
      .insert(championPick)
      .values({ userId, competitionId, teamCode: 'FRA', teamName: 'France', fifaRank: 5, potentialPoints: 10 })

    const result = await backfillChampionRanks(db, liveProvider({ FRA: 50 }))

    expect(result).toEqual({ source: 'live', scanned: 0, changed: 0 })
    expect(await readPick(db, userId)).toMatchObject({ fifaRank: 5, potentialPoints: 10 })
    await client.close()
  })
})
