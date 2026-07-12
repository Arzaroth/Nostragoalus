import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeMatch, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { match } from '../../../db/schema'
import {
  clearOddsMapping,
  closingOddsForOutcome,
  insertOddsSnapshots,
  latestOddsByMatch,
  markMatchesStaleForRescore,
  markOddsChecked,
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
    // The newest m1 snapshot opened with no initial price, so it carries null.
    expect(latest[m1]).toEqual({ home: 1.9, draw: 3.5, away: 4, fetchedAt: new Date(KICKOFF.getTime() - 2 * HOUR), initial: null, bookmakers: null })
    // m2 keeps its opening 1X2 alongside the current price.
    expect(latest[m2]).toMatchObject({ home: 5, draw: 4, away: 1.6, initial: { home: 2, draw: 3.3, away: 3.8 }, bookmakers: null })
    expect(await latestOddsByMatch(db, [])).toEqual({})
    await client.close()
  })

  it('carries opening prices and the per-bookmaker breakdown', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF })
    await insertOddsSnapshots(db, [
      snapshot(m1, new Date(KICKOFF.getTime() - 3 * HOUR), {
        current: { home: 1.8, draw: 3.6, away: 4.2 },
        initial: { home: 2.2, draw: 3.3, away: 3.5 },
        bookmakers: [
          { key: 'bet365', title: 'bet365', home: 1.8, draw: 3.6, away: 4.2 },
          { key: 'pinnacle', title: 'Pinnacle', home: 1.83, draw: 3.55, away: 4.1 },
        ],
      }),
    ])
    const latest = await latestOddsByMatch(db, [m1])
    expect(latest[m1].initial).toEqual({ home: 2.2, draw: 3.3, away: 3.5 })
    expect(latest[m1].bookmakers).toEqual([
      { key: 'bet365', title: 'bet365', home: 1.8, draw: 3.6, away: 4.2 },
      { key: 'pinnacle', title: 'Pinnacle', home: 1.83, draw: 3.55, away: 4.1 },
    ])
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

  it('falls back to a BACKFILL snapshot when no pre-kickoff poll exists', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED' })
    await insertOddsSnapshots(db, [
      // Recovered from the provider archive AFTER the match - real fetch time.
      snapshot(m1, new Date(KICKOFF.getTime() + 30 * 24 * HOUR), { kind: 'BACKFILL', current: { home: 4.2, draw: 3.1, away: 1.9 } }),
      // An in-play POLL row never qualifies, even with backfill present.
      snapshot(m1, new Date(KICKOFF.getTime() + HOUR), { current: { home: 9, draw: 9, away: 9 } }),
    ])
    expect(await closingOddsForOutcome(db, m1, KICKOFF, 'HOME')).toBe(4.2)
    await client.close()
  })

  it('clears a dead mapping and stamps fetch attempts', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m1 = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF })
    await setMatchOddsEventRefs(db, [{ matchId: m1, ref: 'dead', swapped: true }])
    const checked = new Date('2026-06-14T10:00:00Z')
    await markOddsChecked(db, [m1], checked)
    await markOddsChecked(db, [], checked)
    await clearOddsMapping(db, m1)
    const [row] = await db
      .select({ ref: match.oddsEventRef, swapped: match.oddsEventSwapped, checkedAt: match.oddsCheckedAt })
      .from(match)
      .where(eq(match.id, m1))
    expect(row).toEqual({ ref: null, swapped: false, checkedAt: checked })
    await client.close()
  })

  it('flags only SCORED matches for a rescore', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const scored = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED' })
    const pending = await makeMatch(db, { competitionId, roundId, kickoffTime: KICKOFF, status: 'FINISHED' })
    await db.update(match).set({ scoringState: 'SCORED' }).where(eq(match.id, scored))
    await markMatchesStaleForRescore(db, [scored, pending])
    await markMatchesStaleForRescore(db, [])
    const rows = await db.select({ id: match.id, state: match.scoringState }).from(match)
    expect(rows.find((r) => r.id === scored)?.state).toBe('STALE')
    expect(rows.find((r) => r.id === pending)?.state).toBe('PENDING')
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

describe('matchesNeedingOdds window + cadence', () => {
  it('selects mapped scheduled matches inside the window, by attempt staleness', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const now = new Date('2026-06-15T12:00:00Z')
    const mk = async (kickoffTime: Date, over: Partial<Parameters<typeof makeMatch>[1]> = {}) => {
      const id = await makeMatch(db, { competitionId, roundId, kickoffTime, ...over })
      await setMatchOddsEventRefs(db, [{ matchId: id, ref: `ref-${id}` }])
      return id
    }

    const never = await mk(new Date(now.getTime() + 24 * HOUR)) // never checked -> due
    const fresh = await mk(new Date(now.getTime() + 24 * HOUR)) // checked 1h ago -> not due
    const stale = await mk(new Date(now.getTime() + 24 * HOUR)) // checked 7h ago -> due
    const imminent = await mk(new Date(now.getTime() + HOUR)) // checked 1h ago but <2h to kickoff -> due
    const nextWeek = await mk(new Date(now.getTime() + 10 * 24 * HOUR)) // inside the 14d window -> due
    const farFuture = await mk(new Date(now.getTime() + 20 * 24 * HOUR)) // beyond the window -> not due
    const started = await mk(new Date(now.getTime() - HOUR)) // kicked off
    const unmapped = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date(now.getTime() + 24 * HOUR) })

    await markOddsChecked(db, [fresh, imminent], new Date(now.getTime() - HOUR))
    await markOddsChecked(db, [stale], new Date(now.getTime() - 7 * HOUR))

    const due = await matchesNeedingOdds(db, competitionId, now)
    const ids = due.map((d) => d.id)
    expect(ids).toEqual(expect.arrayContaining([never, stale, imminent, nextWeek]))
    expect(ids).not.toContain(fresh)
    expect(ids).not.toContain(farFuture)
    expect(ids).not.toContain(started)
    expect(ids).not.toContain(unmapped)
    expect(due.find((d) => d.id === never)?.oddsEventRef).toBe(`ref-${never}`)
    // Least-recently-checked first: never-checked rows lead, then the 7h-stale one.
    expect(ids.indexOf(stale)).toBeGreaterThan(ids.indexOf(never))
    await client.close()
  })

  it('honors the cadence for unpriced events (attempts stamp, snapshots optional)', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const now = new Date('2026-06-15T12:00:00Z')
    const id = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date(now.getTime() + 24 * HOUR) })
    await setMatchOddsEventRefs(db, [{ matchId: id, ref: 'r' }])

    // An attempt that stored nothing still counts against the cadence.
    await markOddsChecked(db, [id], new Date(now.getTime() - HOUR))
    expect(await matchesNeedingOdds(db, competitionId, now)).toEqual([])

    await markOddsChecked(db, [id], new Date(now.getTime() - 7 * HOUR))
    expect((await matchesNeedingOdds(db, competitionId, now)).map((d) => d.id)).toEqual([id])
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
