import type { AppDatabase } from '../../../db/types'
import { listActiveCompetitions, listCompetitions } from '../competitions/store'
import { ProviderRateLimitError } from '../providers/types'
import { matchEventsToFixtures } from './matcher'
import { sofascoreProvider } from './providers/sofascore'
import {
  clearOddsMapping,
  insertOddsSnapshots,
  latestOddsByMatch,
  markMatchesStaleForRescore,
  markOddsChecked,
  matchesNeedingBackfill,
  matchesNeedingOdds,
  setMatchOddsEventRefs,
  unmappedUpcomingMatches,
} from './store'
import type { FetchedOdds, OddsProvider, OddsTriple } from './types'

// Per-run ceilings keep a tick polite toward the scraped API; whatever is cut
// off is picked up by the next tick (refresh) or the next trigger (backfill).
const MAX_REFRESH_CALLS = 20
const MAX_BACKFILL_CALLS = 30

export type OddsProviderFactory = (key: string) => OddsProvider | null

// One instance per provider for the process lifetime: the rate limiter lives
// inside the provider, so per-call construction would reset the host spacing
// at every competition boundary (and across overlapping runs).
let sofascoreInstance: OddsProvider | null = null
function defaultProviderFactory(key: string): OddsProvider | null {
  if (key === 'sofascore') return (sofascoreInstance ??= sofascoreProvider())
  return null
}

export interface OddsSyncOptions {
  now?: Date
  providerFactory?: OddsProviderFactory
  maxCalls?: number
}

interface CompetitionSummary {
  mapped?: number
  unmatched?: number
  ambiguous?: number
  fetched?: number
  unchanged?: number
  empty?: number
  gone?: number
  late?: number
  errors?: number
  remaining?: number
}

export interface OddsRunSummary {
  competitions: Record<string, CompetitionSummary>
  aborted?: 'rate_limited'
}

interface OddsCompetition {
  id: string
  slug: string
  seasonHint: string | null
  oddsProvider: string | null
  oddsProviderRef: string | null
}

function orient(odds: FetchedOdds, swapped: boolean): FetchedOdds {
  if (!swapped) return odds
  const flip = (t: OddsTriple): OddsTriple => ({ home: t.away, draw: t.draw, away: t.home })
  return {
    ...odds,
    current: flip(odds.current),
    initial: odds.initial ? flip(odds.initial) : null,
    bookmakers: odds.bookmakers?.map((b) => ({ ...b, home: b.away, away: b.home })) ?? null,
  }
}

// The 30-min refresh only touches active competitions (deactivating one stops
// its polling, matching every other sync task); backfill deliberately reaches
// finished/inactive ones - recovering archives is its whole point.
async function oddsCompetitions(db: AppDatabase, scope: 'active' | 'all'): Promise<OddsCompetition[]> {
  const all = scope === 'active' ? await listActiveCompetitions(db) : await listCompetitions(db)
  return all.filter((c) => c.oddsProvider !== null && c.oddsProviderRef !== null)
}

// Resolve provider event ids for fixtures the matcher hasn't claimed yet.
// Unmatched names are logged - that log is the to-do list for TEAM_NAME_ALIASES.
async function mapCompetition(
  db: AppDatabase,
  competition: OddsCompetition,
  provider: OddsProvider,
  fixtures: { id: string; homeTeam: string; awayTeam: string; kickoffTime: Date }[],
  scope: 'upcoming' | 'finished',
): Promise<CompetitionSummary> {
  const events = await provider.listEvents({
    providerRef: competition.oddsProviderRef!,
    seasonHint: competition.seasonHint,
    scope,
  })
  const result = matchEventsToFixtures(events, fixtures)
  await setMatchOddsEventRefs(
    db,
    result.matched.map((m) => ({ matchId: m.fixture.id, ref: m.event.ref, swapped: m.swapped })),
  )
  const unmatchedFixtures = fixtures.length - result.matched.length
  if (unmatchedFixtures > 0) {
    const claimed = new Set(result.matched.map((m) => m.fixture.id))
    for (const fixture of fixtures.filter((f) => !claimed.has(f.id))) {
      console.warn(`[odds] no ${competition.slug} event for "${fixture.homeTeam} vs ${fixture.awayTeam}"`)
    }
  }
  return { mapped: result.matched.length, unmatched: unmatchedFixtures, ambiguous: result.ambiguous.length }
}

interface FetchTarget {
  id: string
  oddsEventRef: string
  oddsEventSwapped: boolean
  kickoffTime: Date
}

interface FetchCounters {
  fetched: number
  unchanged: number
  empty: number
  gone: number
  late: number
  errors: number
}

// Shared per-target fetch step for refresh and backfill: fetch, drop dead
// mappings, orient, dedupe against the latest stored triple, insert, and stamp
// the attempt (so the cadence covers unpriced events too). POLL inserts are
// re-checked against kickoff at insert time - the rate limiter can push a
// fetch past kickoff, and an in-play price must never pose as a closing one.
async function fetchTarget(
  db: AppDatabase,
  provider: OddsProvider,
  providerKey: string,
  target: FetchTarget,
  kind: 'POLL' | 'BACKFILL',
  counters: FetchCounters,
  // The run's logical clock: cadence bookkeeping (oddsCheckedAt) compares
  // against it, while snapshot timestamps use the wall clock (data truth).
  now: Date,
): Promise<void> {
  try {
    const odds = await provider.getEventOdds(target.oddsEventRef)
    const fetchedAt = new Date()
    if (odds === 'gone') {
      await clearOddsMapping(db, target.id)
      counters.gone += 1
      return
    }
    if (odds === null) {
      counters.empty += 1
      return
    }
    if (kind === 'POLL' && fetchedAt.getTime() >= target.kickoffTime.getTime()) {
      counters.late += 1
      return
    }
    const oriented = orient(odds, target.oddsEventSwapped)
    const latest = (await latestOddsByMatch(db, [target.id]))[target.id]
    if (
      kind === 'POLL' &&
      latest &&
      latest.home === oriented.current.home &&
      latest.draw === oriented.current.draw &&
      latest.away === oriented.current.away
    ) {
      counters.unchanged += 1
      return
    }
    await insertOddsSnapshots(db, [
      {
        matchId: target.id,
        provider: providerKey,
        providerEventRef: target.oddsEventRef,
        kind,
        current: oriented.current,
        initial: oriented.initial,
        bookmakers: oriented.bookmakers,
        fetchedAt,
      },
    ])
    counters.fetched += 1
  } catch (error) {
    if (error instanceof ProviderRateLimitError) throw error
    counters.errors += 1
  } finally {
    await markOddsChecked(db, [target.id], now).catch(() => {})
  }
}

export async function syncOdds(db: AppDatabase, opts: OddsSyncOptions = {}): Promise<OddsRunSummary> {
  const now = opts.now ?? new Date()
  const factory = opts.providerFactory ?? defaultProviderFactory
  const maxCalls = opts.maxCalls ?? MAX_REFRESH_CALLS
  const summary: OddsRunSummary = { competitions: {} }
  let budget = maxCalls

  for (const competition of await oddsCompetitions(db, 'active')) {
    const provider = factory(competition.oddsProvider!)
    if (!provider) continue
    const slug = competition.slug
    try {
      const unmapped = await unmappedUpcomingMatches(db, competition.id, now)
      if (unmapped.length > 0) {
        summary.competitions[slug] = await mapCompetition(db, competition, provider, unmapped, 'upcoming')
      }

      const due = await matchesNeedingOdds(db, competition.id, now)
      const batch = due.slice(0, Math.max(budget, 0))
      budget -= batch.length
      const counters: FetchCounters = { fetched: 0, unchanged: 0, empty: 0, gone: 0, late: 0, errors: 0 }
      for (const target of batch) {
        await fetchTarget(db, provider, competition.oddsProvider!, target, 'POLL', counters, now)
      }
      if (due.length > 0) {
        summary.competitions[slug] = {
          ...summary.competitions[slug],
          ...counters,
          remaining: due.length - batch.length,
        }
      }
    } catch (error) {
      // Cloudflare push-back: stop touching the API entirely, keep stale odds.
      if (error instanceof ProviderRateLimitError) {
        summary.aborted = 'rate_limited'
        return summary
      }
      summary.competitions[slug] = { ...summary.competitions[slug], errors: (summary.competitions[slug]?.errors ?? 0) + 1 }
    }
    if (budget <= 0) break
  }
  return summary
}

// Retroactive odds for finished matches (Sofascore keeps closing prices on
// past events). Snapshots carry their real fetch time and kind=BACKFILL; the
// closing-odds resolver falls back to them when no pre-kickoff POLL exists.
// Matches already scored get flagged STALE so the next finalize tick rescores
// them with the recovered odds (the ODDS bonus would otherwise stay at 0).
export async function backfillOdds(db: AppDatabase, opts: OddsSyncOptions = {}): Promise<OddsRunSummary> {
  const factory = opts.providerFactory ?? defaultProviderFactory
  const maxCalls = opts.maxCalls ?? MAX_BACKFILL_CALLS
  const summary: OddsRunSummary = { competitions: {} }
  let budget = maxCalls

  for (const competition of await oddsCompetitions(db, 'all')) {
    const provider = factory(competition.oddsProvider!)
    if (!provider) continue
    const slug = competition.slug
    try {
      let targets = await matchesNeedingBackfill(db, competition.id)
      if (targets.length === 0) continue

      if (targets.some((t) => t.oddsEventRef === null)) {
        const fixtures = targets.filter((t) => t.oddsEventRef === null)
        summary.competitions[slug] = await mapCompetition(db, competition, provider, fixtures, 'finished')
        targets = await matchesNeedingBackfill(db, competition.id)
      }

      const mapped = targets.filter((t) => t.oddsEventRef !== null)
      const batch = mapped.slice(0, Math.max(budget, 0))
      budget -= batch.length
      const counters: FetchCounters = { fetched: 0, unchanged: 0, empty: 0, gone: 0, late: 0, errors: 0 }
      const recovered: string[] = []
      for (const target of batch) {
        const before = counters.fetched
        await fetchTarget(
          db,
          provider,
          competition.oddsProvider!,
          { ...target, oddsEventRef: target.oddsEventRef! },
          'BACKFILL',
          counters,
          new Date(),
        )
        if (counters.fetched > before) recovered.push(target.id)
      }
      await markMatchesStaleForRescore(db, recovered)
      summary.competitions[slug] = {
        ...summary.competitions[slug],
        ...counters,
        remaining: mapped.length - batch.length,
      }
    } catch (error) {
      if (error instanceof ProviderRateLimitError) {
        summary.aborted = 'rate_limited'
        return summary
      }
      summary.competitions[slug] = { ...summary.competitions[slug], errors: (summary.competitions[slug]?.errors ?? 0) + 1 }
    }
    if (budget <= 0) break
  }
  return summary
}
