import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeMatch, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { match } from '../../../db/schema'
import {
  closingOddsForOutcome,
  insertOddsSnapshots,
  latestOddsByMatch,
  matchesNeedingBackfill,
  matchesNeedingOdds,
  setMatchOddsEventRefs,
  type OddsSnapshotInsert,
} from './store'

const KICKOFF = new Date('2026-06-15T18:00:00Z')
const HOUR = 60 * 60 * 1000

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  return { ...ctx, competitionId, roundId }
}

function snapshot(matchId: string, fetchedAt: Date, over: Partial<OddsSnapshotInsert> = {}): OddsSnapshotInsert {
  return {
    matchId,
    provider: 'sofascore',
    providerEventRef: 'e1',
    kind: 'POLL',
    current: { home: 2.1, draw: 3.4, away: 3.6 },
    initial: { home: 2, draw: 3.3, away: 3.8 },
    bookmakers: null,
    fetchedAt,
    ...over,
  }
}

describe('odds store snapshots', () => {
  it('returns the newest snapshot per match with numeric values', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF })
    const m2 = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF })
    expect(await insertOddsSnapshots(db, [])).toBe(0)
    await insertOddsSnapshots(db, [
      snapshot(m1, new Date(KICKOFF.getTime() - 10 * HOUR)),
      snapshot(m1, new Date(KICKOFF.getTime() - 2 * HOUR), { current: { home: 1.9, draw: 3.5, away: 4 }, initial: null }),
      snapshot(m2, new Date(KICKOFF.getTime() - 5 * HOUR), { current: { home: 5, draw: 4, away: 1.6 } }),
    ])
    const latest = await latestOddsByMatch(db, [m1, m2])
    expect(latest[m1]).toEqual({ home: 1.9, draw: 3.5, away: 4, fetchedAt: new Date(KICKOFF.getTime() - 2 * HOUR) })
    expect(latest[m2]).toMatchObject({ home: 5, draw: 4, away: 1.6 })
    expect(await latestOddsByMatch(db, [])).toEqual({})
    await client.close()
  })

  it('resolves closing odds per outcome, ignoring post-kickoff rows', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF })
    await insertOddsSnapshots(db, [
      snapshot(m1, new Date(KICKOFF.getTime() - 6 * HOUR), { current: { home: 2.5, draw: 3.2, away: 3 } }),
      snapshot(m1, KICKOFF, { current: { home: 2.1, draw: 3.4, away: 3.6 } }),
      // In-play price - never used for scoring.
      snapshot(m1, new Date(KICKOFF.getTime() + HOUR), { current: { home: 9, draw: 9, away: 9 } }),
    ])
    expect(await closingOddsForOutcome(db, m1, KICKOFF, 'HOME')).toBe(2.1)
    expect(await closingOddsForOutcome(db, m1, KICKOFF, 'DRAW')).toBe(3.4)
    expect(await closingOddsForOutcome(db, m1, KICKOFF, 'AWAY')).toBe(3.6)
    expect(await closingOddsForOutcome(db, 'missing', KICKOFF, 'HOME')).toBeNull()
    await client.close()
  })

  it('persists odds event refs', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF })
    await setMatchOddsEventRefs(db, [{ matchId: m1, ref: '4242' }])
    const [row] = await db.select({ ref: match.oddsEventRef }).from(match).where(eq(match.id, m1))
    expect(row.ref).toBe('4242')
    await client.close()
  })
})

describe('matchesNeedingOdds round gate + cadence', () => {
  it('limits odds to the current round, with staleness cadence', async () => {
    const { db, client, competitionId } = await setup()
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const md2 = (await findRoundId(db, competitionId, 'GROUP', 2)) as string
    const now = new Date('2026-06-15T12:00:00Z')
    const mk = async (roundId: string, kickoffTime: Date, over: Partial<Parameters<typeof makeMatch>[1]> = {}) => {
      const id = await makeMatch(db, { competitionId, roundId, kickoffTime, ...over })
      await setMatchOddsEventRefs(db, [{ matchId: id, ref: `ref-${id}` }])
      return id
    }

    // Current round (MD1): every cadence case.
    const never = await mk(md1, new Date(now.getTime() + 24 * HOUR)) // no snapshot -> due
    const fresh = await mk(md1, new Date(now.getTime() + 24 * HOUR)) // 1h-old snapshot -> not due
    const stale = await mk(md1, new Date(now.getTime() + 24 * HOUR)) // 7h-old snapshot -> due
    const imminent = await mk(md1, new Date(now.getTime() + HOUR)) // 1h-old snapshot but <2h to kickoff -> due
    const farInRound = await mk(md1, new Date(now.getTime() + 100 * HOUR)) // no horizon: still due
    const started = await mk(md1, new Date(now.getTime() - HOUR)) // kicked off
    const live = await mk(md1, new Date(now.getTime() + 24 * HOUR), { status: 'LIVE' }) // keeps MD1 open
    const unmapped = await makeMatch(db, { competitionId, roundId: md1, kickoffTime: new Date(now.getTime() + 24 * HOUR) })

    // Next round (MD2): not the current round -> never due while MD1 is open.
    const next = await mk(md2, new Date(now.getTime() + 48 * HOUR))

    await insertOddsSnapshots(db, [
      snapshot(fresh, new Date(now.getTime() - HOUR)),
      snapshot(stale, new Date(now.getTime() - 7 * HOUR)),
      snapshot(imminent, new Date(now.getTime() - HOUR)),
    ])

    const ids = (await matchesNeedingOdds(db, [competitionId], now)).map((d) => d.id)
    expect(ids).toEqual(expect.arrayContaining([never, stale, imminent, farInRound]))
    expect(ids).not.toContain(fresh)
    expect(ids).not.toContain(started)
    expect(ids).not.toContain(live)
    expect(ids).not.toContain(unmapped)
    expect(ids).not.toContain(next)
    expect(
      (await matchesNeedingOdds(db, [competitionId], now)).find((d) => d.id === never)?.oddsEventRef,
    ).toBe(`ref-${never}`)
    expect(await matchesNeedingOdds(db, [], now)).toEqual([])
    await client.close()
  })

  it('pairs the third-place playoff and the final as one closing level', async () => {
    const { db, client, competitionId } = await setup()
    const third = (await findRoundId(db, competitionId, 'THIRD_PLACE', null)) as string
    const final = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    const now = new Date('2026-07-18T12:00:00Z')
    const tp = await makeMatch(db, { competitionId, roundId: third, stage: 'THIRD_PLACE', kickoffTime: new Date(now.getTime() + 24 * HOUR) })
    const fn = await makeMatch(db, { competitionId, roundId: final, stage: 'FINAL', kickoffTime: new Date(now.getTime() + 48 * HOUR) })
    await setMatchOddsEventRefs(db, [
      { matchId: tp, ref: 't' },
      { matchId: fn, ref: 'f' },
    ])

    const ids = (await matchesNeedingOdds(db, [competitionId], now)).map((d) => d.id)
    expect(ids).toEqual(expect.arrayContaining([tp, fn]))
    expect(ids).toHaveLength(2)
    await client.close()
  })

  it('advances to the next round once the current round is fully played', async () => {
    const { db, client, competitionId } = await setup()
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const md2 = (await findRoundId(db, competitionId, 'GROUP', 2)) as string
    const now = new Date('2026-06-15T12:00:00Z')

    const md1match = await makeMatch(db, { competitionId, roundId: md1, kickoffTime: new Date(now.getTime() + HOUR) })
    const md2match = await makeMatch(db, { competitionId, roundId: md2, kickoffTime: new Date(now.getTime() + 48 * HOUR) })
    await setMatchOddsEventRefs(db, [
      { matchId: md1match, ref: 'r1' },
      { matchId: md2match, ref: 'r2' },
    ])

    // MD1 open -> only MD1 eligible.
    expect((await matchesNeedingOdds(db, [competitionId], now)).map((d) => d.id)).toEqual([md1match])

    // MD1 played out -> MD2 becomes the current round.
    await db.update(match).set({ status: 'FINISHED' }).where(eq(match.id, md1match))
    expect((await matchesNeedingOdds(db, [competitionId], now)).map((d) => d.id)).toEqual([md2match])
    await client.close()
  })
})

describe('matchesNeedingBackfill', () => {
  it('lists finished matches without snapshots, keeping any known event ref', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const done = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED' })
    const covered = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED' })
    await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'SCHEDULED' })
    await setMatchOddsEventRefs(db, [{ matchId: done, ref: '99' }])
    await insertOddsSnapshots(db, [snapshot(covered, KICKOFF, { kind: 'BACKFILL' })])

    const rows = await matchesNeedingBackfill(db, competitionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: done, oddsEventRef: '99', kickoffTime: KICKOFF })
    await client.close()
  })
})
