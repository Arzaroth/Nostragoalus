import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { resolveCompetitionSeason, syncFixtures, syncLive } from './competition'
import { findRoundId } from './rounds'
import { makeCompetition } from '../../../tests/factories'
import { getCompetitionById } from '../competitions/store'
import { match } from '../../../db/schema'
import type { MatchDataProvider } from '../providers/types'
import type { NormalizedMatch } from '../../../shared/types/match'

function nm(over: Partial<NormalizedMatch> = {}): NormalizedMatch {
  return {
    providerMatchId: 'x1',
    stage: 'GROUP',
    group: 'A',
    matchday: 1,
    homeTeam: { name: 'H', code: null },
    awayTeam: { name: 'A', code: null },
    kickoffTime: '2026-06-11T16:00:00Z',
    status: 'SCHEDULED',
    score: { fullTime: { home: null, away: null } },
    winner: null,
    ...over,
  }
}

function fakeProvider(fixtures: NormalizedMatch[], live: NormalizedMatch[] = []): MatchDataProvider {
  return {
    meta: { name: 'fake', rateLimitPerMin: 60, dailyCap: null },
    listFixtures: async () => fixtures,
    getMatchesByDate: async () => fixtures,
    getLiveMatches: async () => live,
  }
}

describe('resolveCompetitionSeason', () => {
  it('returns undefined for non-fifa providers', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db, { provider: 'football-data', externalSeasonId: null })
    const comp = (await getCompetitionById(db, id)) as NonNullable<Awaited<ReturnType<typeof getCompetitionById>>>
    const resolver = vi.fn()
    expect(await resolveCompetitionSeason(db, comp, resolver)).toBeUndefined()
    expect(resolver).not.toHaveBeenCalled()
    await client.close()
  })

  it('falls back to the default resolver argument when none is supplied', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db, { provider: 'football-data', externalSeasonId: null })
    const comp = (await getCompetitionById(db, id)) as NonNullable<Awaited<ReturnType<typeof getCompetitionById>>>
    expect(await resolveCompetitionSeason(db, comp)).toBeUndefined()
    await client.close()
  })

  it('returns the cached season without calling the resolver', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db, { externalSeasonId: '285023' })
    const comp = (await getCompetitionById(db, id)) as NonNullable<Awaited<ReturnType<typeof getCompetitionById>>>
    const resolver = vi.fn()
    expect(await resolveCompetitionSeason(db, comp, resolver)).toBe('285023')
    expect(resolver).not.toHaveBeenCalled()
    await client.close()
  })

  it('resolves and caches the season when missing', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db, { externalSeasonId: null, seasonHint: '2026' })
    const comp = (await getCompetitionById(db, id)) as NonNullable<Awaited<ReturnType<typeof getCompetitionById>>>
    const resolver = vi.fn(async () => '285023')
    expect(await resolveCompetitionSeason(db, comp, resolver)).toBe('285023')
    expect(resolver).toHaveBeenCalledWith({ competitionId: '17', hint: '2026' })
    expect((await getCompetitionById(db, id))?.externalSeasonId).toBe('285023')
    await client.close()
  })
})

describe('syncFixtures / syncLive', () => {
  it('creates rounds and upserts fixtures', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db)
    const provider = fakeProvider([
      nm({ providerMatchId: 'a' }),
      nm({ providerMatchId: 'b', stage: 'FINAL', group: null, matchday: null }),
    ])
    const res = await syncFixtures(db, id, provider, '2026')
    expect(res.inserted).toBe(2)
    expect(await findRoundId(db, id, 'GROUP', 1)).toBeTypeOf('string')
    expect(await findRoundId(db, id, 'FINAL', null)).toBeTypeOf('string')
    await client.close()
  })

  it('upserts live matches', async () => {
    const { db, client } = await createTestDb()
    const id = await makeCompetition(db)
    await syncFixtures(db, id, fakeProvider([nm({ providerMatchId: 'a' })]), '2026')
    const res = await syncLive(db, id, fakeProvider([], [nm({ providerMatchId: 'a', status: 'LIVE', score: { fullTime: { home: 1, away: 0 } } })]))
    expect(res.updated).toBe(1)
    expect((await db.select().from(match))[0].status).toBe('LIVE')
    await client.close()
  })
})
