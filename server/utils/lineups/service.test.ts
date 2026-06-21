import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, seedCompetition } from '../../../tests/factories'
import { matchLineups } from '../../../db/schema'
import { getStoredLineups, storeLineups, type LineupMeta } from './service'
import type { MatchLineups, SquadPlayer, TeamLineup } from '#shared/types/match'

const player = (shirt: number, position: SquadPlayer['position']): SquadPlayer => ({ playerId: `p${shirt}`, name: `P${shirt}`, shirtNumber: shirt, position, captain: false, pictureUrl: null })
const team = (): TeamLineup => ({ formation: null, coach: null, startingXI: [player(1, 'GK'), player(2, 'DF'), player(3, 'FW')], bench: [] })
const base = (over: Partial<MatchLineups> = {}): MatchLineups => ({ available: true, home: team(), away: team(), ...over })

const META: LineupMeta = { status: 'LIVE', oddsProvider: 'sofascore', oddsEventRef: 'evt1', oddsEventSwapped: false }

const sofaSide = (formation: string | null) => ({ formation, players: [{ shirtNumber: 1, position: 'G', substitute: false }, { shirtNumber: 2, position: 'D', substitute: false }, { shirtNumber: 3, position: 'F', substitute: false }] })
const sofaResp = (home: string | null = '1-1', away: string | null = '1-1') => ({ confirmed: true, home: sofaSide(home), away: sofaSide(away) })
const sofaFetch = (payload: unknown, ok = true): typeof fetch => (async () => new Response(JSON.stringify(payload), { status: ok ? 200 : 404 })) as unknown as typeof fetch

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const matchId = await makeMatch(ctx.db, { competitionId, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'SCHEDULED' })
  return { ...ctx, matchId }
}
const rowFor = async (db: Awaited<ReturnType<typeof setup>>['db'], matchId: string) =>
  (await db.select().from(matchLineups).where(eq(matchLineups.matchId, matchId)))[0]

describe('storeLineups', () => {
  it('refines FIFA positions from Sofascore and persists', async () => {
    const { db, client, matchId } = await setup()
    const out = await storeLineups(db, matchId, base(), META, { sofascore: { fetchImpl: sofaFetch(sofaResp()) }, now: 1000 })
    expect(out!.home.startingXI.map((p) => [p.shirtNumber, p.x, p.y])).toEqual([[1, 50, 7], [2, 50, 24], [3, 50, 92]])
    const row = await rowFor(db, matchId)
    expect(row.data.home.startingXI[2].y).toBe(92)
    expect(row.final).toBe(false) // status LIVE, not frozen
    await client.close()
  })

  it('freezes a finished available line-up and skips refine when no Sofascore anchor', async () => {
    const { db, client, matchId } = await setup()
    const out = await storeLineups(db, matchId, base(), { ...META, status: 'FINISHED', oddsProvider: 'betexplorer', oddsEventRef: null }, { now: 1000 })
    expect(out!.home.startingXI[0].x == null).toBe(true) // no refinement -> falls back to bands
    expect((await rowFor(db, matchId)).final).toBe(true)
    await client.close()
  })

  it('routes coordinates by the swap flag and tolerates a side it cannot place', async () => {
    const { db, client, matchId } = await setup()
    // away formation null -> Sofascore away unplaced; swapped -> our home takes
    // the (null) away coords and stays on bands, our away takes home coords.
    const out = await storeLineups(db, matchId, base(), { ...META, oddsEventSwapped: true }, { sofascore: { fetchImpl: sofaFetch(sofaResp('1-1', null)) }, now: 1 })
    expect(out!.home.startingXI[0].x == null).toBe(true)
    expect(out!.away.startingXI[0].x).toBe(50)
    await client.close()
  })

  it('keeps bands when the Sofascore fetch misses, and stores nothing for a null base', async () => {
    const { db, client, matchId } = await setup()
    const miss = await storeLineups(db, matchId, base(), META, { sofascore: { fetchImpl: sofaFetch({}, false) }, now: 1 })
    expect(miss!.home.startingXI[0].x == null).toBe(true)
    const nullBase = await storeLineups(db, matchId, null, META)
    expect(nullBase).toBeNull()
    await client.close()
  })

  it('does not refine an unavailable line-up', async () => {
    const { db, client, matchId } = await setup()
    const out = await storeLineups(db, matchId, base({ available: false }), { ...META, status: 'FINISHED' }, { sofascore: { fetchImpl: sofaFetch(sofaResp()) }, now: 1 })
    expect(out!.available).toBe(false)
    expect((await rowFor(db, matchId)).final).toBe(false) // available:false never freezes
    await client.close()
  })
})

describe('getStoredLineups', () => {
  it('serves fresh and final rows, misses stale pending ones', async () => {
    const { db, client, matchId } = await setup()
    expect((await getStoredLineups(db, matchId, 0)).hit).toBe(false) // nothing stored

    await storeLineups(db, matchId, base({ available: false }), { ...META, status: 'LIVE', oddsProvider: 'betexplorer', oddsEventRef: null }, { now: 1000 })
    expect((await getStoredLineups(db, matchId, 1000 + 30_000)).hit).toBe(true) // within TTL
    expect((await getStoredLineups(db, matchId, 1000 + 120_000)).hit).toBe(false) // stale pending

    await storeLineups(db, matchId, base(), { ...META, status: 'FINISHED', oddsProvider: 'betexplorer', oddsEventRef: null }, { now: 2000 })
    expect((await getStoredLineups(db, matchId, 2000 + 9_999_999)).hit).toBe(true) // final -> forever
    await client.close()
  })
})
