import type { AppDatabase } from '../../../db/types'
import { listCompetitions } from '../competitions/store'
import { ProviderRateLimitError } from '../providers/types'
import { matchEventsToFixtures } from './matcher'
import { sofascoreProvider } from './providers/sofascore'
import {
  insertOddsSnapshots,
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

const PROVIDERS: Record<string, () => OddsProvider> = {
  sofascore: () => sofascoreProvider(),
}

export type OddsProviderFactory = (key: string) => OddsProvider | null

function defaultProviderFactory(key: string): OddsProvider | null {
  return PROVIDERS[key]?.() ?? null
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
  empty?: number
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
  return { ...odds, current: flip(odds.current), initial: odds.initial ? flip(odds.initial) : null }
}

async function oddsCompetitions(db: AppDatabase): Promise<OddsCompetition[]> {
  const all = await listCompetitions(db)
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

export async function syncOdds(db: AppDatabase, opts: OddsSyncOptions = {}): Promise<OddsRunSummary> {
  const now = opts.now ?? new Date()
  const factory = opts.providerFactory ?? defaultProviderFactory
  const maxCalls = opts.maxCalls ?? MAX_REFRESH_CALLS
  const summary: OddsRunSummary = { competitions: {} }
  let budget = maxCalls

  for (const competition of await oddsCompetitions(db)) {
    const provider = factory(competition.oddsProvider!)
    if (!provider) continue
    const slug = competition.slug
    try {
      const unmapped = await unmappedUpcomingMatches(db, competition.id, now)
      if (unmapped.length > 0) {
        summary.competitions[slug] = await mapCompetition(db, competition, provider, unmapped, 'upcoming')
      }

      const due = await matchesNeedingOdds(db, [competition.id], now)
      const batch = due.slice(0, Math.max(budget, 0))
      budget -= batch.length
      let fetched = 0
      let empty = 0
      let errors = 0
      for (const target of batch) {
        try {
          const odds = await provider.getEventOdds(target.oddsEventRef)
          if (odds === null) {
            empty += 1
            continue
          }
          const oriented = orient(odds, target.oddsEventSwapped)
          await insertOddsSnapshots(db, [
            {
              matchId: target.id,
              provider: competition.oddsProvider!,
              providerEventRef: target.oddsEventRef,
              kind: 'POLL',
              current: oriented.current,
              initial: oriented.initial,
              bookmakers: oriented.bookmakers,
              fetchedAt: now,
            },
          ])
          fetched += 1
        } catch (error) {
          if (error instanceof ProviderRateLimitError) throw error
          errors += 1
        }
      }
      if (due.length > 0) {
        summary.competitions[slug] = {
          ...summary.competitions[slug],
          fetched,
          empty,
          errors,
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
// past events). Snapshots are stamped with the kickoff itself: that is the
// closing state, and the scoring resolver only looks at/before kickoff.
export async function backfillOdds(db: AppDatabase, opts: OddsSyncOptions = {}): Promise<OddsRunSummary> {
  const factory = opts.providerFactory ?? defaultProviderFactory
  const maxCalls = opts.maxCalls ?? MAX_BACKFILL_CALLS
  const summary: OddsRunSummary = { competitions: {} }
  let budget = maxCalls

  for (const competition of await oddsCompetitions(db)) {
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
      let fetched = 0
      let empty = 0
      let errors = 0
      for (const target of batch) {
        try {
          const odds = await provider.getEventOdds(target.oddsEventRef!)
          if (odds === null) {
            empty += 1
            continue
          }
          const oriented = orient(odds, target.oddsEventSwapped)
          await insertOddsSnapshots(db, [
            {
              matchId: target.id,
              provider: competition.oddsProvider!,
              providerEventRef: target.oddsEventRef!,
              kind: 'BACKFILL',
              current: oriented.current,
              initial: oriented.initial,
              bookmakers: oriented.bookmakers,
              fetchedAt: target.kickoffTime,
            },
          ])
          fetched += 1
        } catch (error) {
          if (error instanceof ProviderRateLimitError) throw error
          errors += 1
        }
      }
      summary.competitions[slug] = {
        ...summary.competitions[slug],
        fetched,
        empty,
        errors,
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
