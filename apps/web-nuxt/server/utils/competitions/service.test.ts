import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { addCompetition } from './service'
import { listCompetitions } from './store'
import { ValidationError } from '../errors'
import type { AppStage, NormalizedMatch } from '../../../shared/types/match'
import type { MatchDataProvider } from '../providers/types'

let seq = 0

function fixture(stage: AppStage, matchday: number | null = null, group: string | null = null): NormalizedMatch {
  const n = ++seq
  return {
    providerMatchId: `m-${n}`,
    stage,
    group,
    matchday,
    homeTeam: { id: `h${n}`, name: `Home ${n}`, code: 'HOM' },
    awayTeam: { id: `a${n}`, name: `Away ${n}`, code: 'AWY' },
    kickoffTime: '2026-06-11T16:00:00Z',
    status: 'SCHEDULED',
    score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null }, penalties: null },
    winner: null,
  } as NormalizedMatch
}

function adapter(fixtures: NormalizedMatch[]): MatchDataProvider {
  return {
    meta: { name: 'stub', rateLimitPerMin: 0, dailyCap: null },
    listFixtures: async () => fixtures,
    getMatchesByDate: async () => [],
    getLiveMatches: async () => [],
  } as MatchDataProvider
}

const input = {
  slug: 'euro-2028',
  name: 'UEFA Euro 2028',
  provider: 'espn',
  externalCompetitionId: 'uefa.euro',
  seasonHint: '2028',
}

describe('addCompetition', () => {
  it('creates the competition once the probe comes back clean', async () => {
    const { db, client } = await createTestDb()
    const row = await addCompetition(db, input, {
      makeProvider: () => adapter([fixture('GROUP', 1, 'A'), fixture('FINAL')]),
      resolveSeason: async () => undefined,
    })
    expect(row).toMatchObject({ slug: 'euro-2028', provider: 'espn', isActive: true })
    await client.close()
  })

  // The guarantee the whole feature rests on: the season is re-read here, so a
  // client that claims a clean probe cannot talk its way past the gate.
  it('refuses a competition the app would silently fail to ingest, and writes nothing', async () => {
    const { db, client } = await createTestDb()
    await expect(
      addCompetition(db, input, {
        // A domestic league: GROUP stage with no letter, so no matchday can be
        // derived and every fixture would be dropped at insert.
        makeProvider: () => adapter([fixture('GROUP'), fixture('GROUP')]),
        resolveSeason: async () => undefined,
      }),
    ).rejects.toThrow(ValidationError)
    expect(await listCompetitions(db)).toHaveLength(0)
    await client.close()
  })

  it('names the blockers in the refusal so the admin knows why', async () => {
    const { db, client } = await createTestDb()
    await expect(
      addCompetition(db, input, {
        makeProvider: () => adapter([]),
        resolveSeason: async () => undefined,
      }),
    ).rejects.toThrow(/no_fixtures/)
    await client.close()
  })

  it('probes before touching the database at all', async () => {
    const { db, client } = await createTestDb()
    const listFixtures = vi.fn(async () => [fixture('FINAL')])
    await addCompetition(db, input, {
      makeProvider: () => ({ ...adapter([]), listFixtures }) as MatchDataProvider,
      resolveSeason: async () => undefined,
    })
    expect(listFixtures).toHaveBeenCalledWith({ season: '2028' })
    await client.close()
  })
})
