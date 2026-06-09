import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeMatch, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { match, oddsSnapshot } from '../../../db/schema'
import { ProviderRateLimitError } from '../providers/types'
import { backfillOdds, syncOdds } from './sync'
import type { FetchedOdds, OddsEvent, OddsProvider } from './types'

const NOW = new Date('2026-06-14T12:00:00Z')
const KICKOFF = new Date('2026-06-15T18:00:00Z')

const TRIPLE = { home: 2.1, draw: 3.4, away: 3.6 }

function fakeProvider(over: Partial<OddsProvider> = {}): OddsProvider {
  return {
    key: 'sofascore',
    listEvents: async () => [],
    getEventOdds: async () => ({ current: TRIPLE, initial: null, bookmakers: null }),
    ...over,
  }
}

function sofaEvent(over: Partial<OddsEvent> = {}): OddsEvent {
  return { ref: '777', homeName: 'France', awayName: 'Brazil', kickoff: KICKOFF, finished: false, ...over }
}

async function setup(over: Parameters<typeof seedCompetition>[1] = {}) {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db, {
    slug: 'world-cup-2026',
    oddsProvider: 'sofascore',
    oddsProviderRef: '16',
    seasonHint: '2026',
    ...over,
  })
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  return { ...ctx, competitionId, roundId }
}

describe('syncOdds', () => {
  it('maps unmapped fixtures then snapshots due matches in one pass', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, homeTeam: 'France', awayTeam: 'Brazil' })
    const listEvents = vi.fn(async () => [sofaEvent()])
    const getEventOdds = vi.fn(async () => ({ current: TRIPLE, initial: TRIPLE, bookmakers: null }))
    const summary = await syncOdds(db, { now: NOW, providerFactory: () => fakeProvider({ listEvents, getEventOdds }) })

    expect(listEvents).toHaveBeenCalledWith({ providerRef: '16', seasonHint: '2026', scope: 'upcoming' })
    expect(getEventOdds).toHaveBeenCalledWith('777')
    const [row] = await db.select().from(match).where(eq(match.id, m1))
    expect(row.oddsEventRef).toBe('777')
    expect(row.oddsEventSwapped).toBe(false)
    const snaps = await db.select().from(oddsSnapshot).where(eq(oddsSnapshot.matchId, m1))
    expect(snaps).toHaveLength(1)
    expect(snaps[0]).toMatchObject({ kind: 'POLL', provider: 'sofascore', oddsHome: '2.100', fetchedAt: NOW })
    expect(summary.competitions['world-cup-2026']).toMatchObject({ mapped: 1, fetched: 1, errors: 0, remaining: 0 })

    // Second run inside the staleness window: no re-mapping, no new snapshot.
    const summary2 = await syncOdds(db, { now: NOW, providerFactory: () => fakeProvider({ listEvents, getEventOdds }) })
    expect(listEvents).toHaveBeenCalledTimes(1)
    expect(getEventOdds).toHaveBeenCalledTimes(1)
    expect(summary2.competitions['world-cup-2026']).toBeUndefined()
    await client.close()
  })

  it('flips odds for swapped orientation', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, homeTeam: 'Brazil', awayTeam: 'France' })
    const provider = fakeProvider({
      listEvents: async () => [sofaEvent()],
      getEventOdds: async () => ({ current: { home: 1.5, draw: 4, away: 6 }, initial: { home: 1.4, draw: 4, away: 7 }, bookmakers: null }),
    })
    await syncOdds(db, { now: NOW, providerFactory: () => provider })
    const [snap] = await db.select().from(oddsSnapshot).where(eq(oddsSnapshot.matchId, m1))
    expect(snap).toMatchObject({
      oddsHome: '6.000',
      oddsAway: '1.500',
      oddsDraw: '4.000',
      initialHome: '7.000',
      initialAway: '1.400',
    })
    await client.close()
  })

  it('caps calls per run and reports the overflow', async () => {
    const { db, client, competitionId, roundId } = await setup()
    for (let i = 0; i < 3; i += 1) {
      const id = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF })
      await db.update(match).set({ oddsEventRef: `ref-${i}` }).where(eq(match.id, id))
    }
    const getEventOdds = vi.fn(async () => ({ current: TRIPLE, initial: null, bookmakers: null }))
    const summary = await syncOdds(db, { now: NOW, maxCalls: 2, providerFactory: () => fakeProvider({ getEventOdds }) })
    expect(getEventOdds).toHaveBeenCalledTimes(2)
    expect(summary.competitions['world-cup-2026']).toMatchObject({ fetched: 2, remaining: 1 })
    await client.close()
  })

  it('contains per-event failures and counts empty odds separately', async () => {
    const { db, client, competitionId, roundId } = await setup()
    for (let i = 0; i < 3; i += 1) {
      const id = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF })
      await db.update(match).set({ oddsEventRef: `ref-${i}` }).where(eq(match.id, id))
    }
    let call = 0
    const getEventOdds = async (): Promise<FetchedOdds | null> => {
      call += 1
      if (call === 1) throw new Error('boom')
      if (call === 2) return null
      return { current: TRIPLE, initial: null, bookmakers: null }
    }
    const summary = await syncOdds(db, { now: NOW, providerFactory: () => fakeProvider({ getEventOdds }) })
    expect(summary.competitions['world-cup-2026']).toMatchObject({ fetched: 1, empty: 1, errors: 1 })
    await client.close()
  })

  it('aborts the whole run on a rate limit, keeping stale data', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const id = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF })
    await db.update(match).set({ oddsEventRef: 'ref' }).where(eq(match.id, id))
    const summary = await syncOdds(db, {
      now: NOW,
      providerFactory: () =>
        fakeProvider({
          getEventOdds: async () => {
            throw new ProviderRateLimitError()
          },
        }),
    })
    expect(summary.aborted).toBe('rate_limited')
    expect(await db.select().from(oddsSnapshot)).toHaveLength(0)
    await client.close()
  })

  it('skips competitions without odds config or with an unknown provider', async () => {
    const { db, client } = await createTestDb()
    await seedCompetition(db, { slug: 'plain' })
    await seedCompetition(db, { slug: 'odd', oddsProvider: 'betexplorer', oddsProviderRef: 'x' })
    const summary = await syncOdds(db, { now: NOW, providerFactory: (key) => (key === 'sofascore' ? fakeProvider() : null) })
    expect(summary.competitions).toEqual({})
    await client.close()
  })

  it('logs fixtures the provider does not list', async () => {
    const { db, client, competitionId, roundId } = await setup()
    await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, homeTeam: 'France', awayTeam: 'Brazil' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const summary = await syncOdds(db, { now: NOW, providerFactory: () => fakeProvider() })
    expect(summary.competitions['world-cup-2026']).toMatchObject({ mapped: 0, unmatched: 1 })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('France vs Brazil'))
    warn.mockRestore()
    await client.close()
  })
})

describe('backfillOdds', () => {
  it('maps finished matches and stamps BACKFILL snapshots at kickoff', async () => {
    const { db, client, competitionId, roundId } = await setup({ seasonHint: '2022' })
    const past = new Date('2022-11-29T19:00:00Z')
    const m1 = await makeMatch(db, {
      competitionId,
      roundId,
      kickoffTime: past,
      status: 'FINISHED',
      homeTeam: 'Iran',
      awayTeam: 'USA',
      fullTimeHome: 0,
      fullTimeAway: 1,
    })
    await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'SCHEDULED' })
    const listEvents = vi.fn(async () => [
      sofaEvent({ ref: '555', homeName: 'Iran', awayName: 'United States', kickoff: past, finished: true }),
    ])
    const summary = await backfillOdds(db, { providerFactory: () => fakeProvider({ listEvents }) })

    expect(listEvents).toHaveBeenCalledWith({ providerRef: '16', seasonHint: '2022', scope: 'finished' })
    const snaps = await db.select().from(oddsSnapshot).where(eq(oddsSnapshot.matchId, m1))
    expect(snaps).toHaveLength(1)
    expect(snaps[0]).toMatchObject({ kind: 'BACKFILL', providerEventRef: '555', fetchedAt: past })
    expect(summary.competitions['world-cup-2026']).toMatchObject({ mapped: 1, fetched: 1, remaining: 0 })

    // Drained: nothing left to backfill, no provider calls.
    const again = await backfillOdds(db, { providerFactory: () => fakeProvider({ listEvents }) })
    expect(again.competitions).toEqual({})
    expect(listEvents).toHaveBeenCalledTimes(1)
    await client.close()
  })

  it('caps backfill calls per run and reports the rest', async () => {
    const { db, client, competitionId, roundId } = await setup()
    for (let i = 0; i < 3; i += 1) {
      const id = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED' })
      await db.update(match).set({ oddsEventRef: `ref-${i}` }).where(eq(match.id, id))
    }
    const summary = await backfillOdds(db, { maxCalls: 2, providerFactory: () => fakeProvider() })
    expect(summary.competitions['world-cup-2026']).toMatchObject({ fetched: 2, remaining: 1 })
    await client.close()
  })

  it('aborts on rate limit during backfill', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const id = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED' })
    await db.update(match).set({ oddsEventRef: 'ref' }).where(eq(match.id, id))
    const summary = await backfillOdds(db, {
      providerFactory: () =>
        fakeProvider({
          getEventOdds: async () => {
            throw new ProviderRateLimitError()
          },
        }),
    })
    expect(summary.aborted).toBe('rate_limited')
    await client.close()
  })

  it('counts events without odds and contained errors', async () => {
    const { db, client, competitionId, roundId } = await setup()
    for (let i = 0; i < 2; i += 1) {
      const id = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED' })
      await db.update(match).set({ oddsEventRef: `ref-${i}` }).where(eq(match.id, id))
    }
    let call = 0
    const summary = await backfillOdds(db, {
      providerFactory: () =>
        fakeProvider({
          getEventOdds: async () => {
            call += 1
            if (call === 1) return null
            throw new Error('boom')
          },
        }),
    })
    expect(summary.competitions['world-cup-2026']).toMatchObject({ fetched: 0, empty: 1, errors: 1 })
    await client.close()
  })
})
