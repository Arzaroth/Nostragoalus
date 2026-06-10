import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, oddsSnapshot } from '../../../db/schema'
import type { OddsSnapshotKind, StoredBookmakerOdds } from '../../../shared/types/odds'
import type { Outcome } from '../scoring/tiers'
import type { OddsTriple } from './types'

export interface OddsSnapshotInsert {
  matchId: string
  provider: string
  providerEventRef: string
  kind: OddsSnapshotKind
  current: OddsTriple
  initial: OddsTriple | null
  bookmakers: StoredBookmakerOdds[] | null
  fetchedAt: Date
}

export async function insertOddsSnapshots(db: AppDatabase, rows: OddsSnapshotInsert[]): Promise<number> {
  if (rows.length === 0) return 0
  await db.insert(oddsSnapshot).values(
    rows.map((r) => ({
      matchId: r.matchId,
      provider: r.provider,
      providerEventRef: r.providerEventRef,
      kind: r.kind,
      oddsHome: String(r.current.home),
      oddsDraw: String(r.current.draw),
      oddsAway: String(r.current.away),
      initialHome: r.initial === null ? null : String(r.initial.home),
      initialDraw: r.initial === null ? null : String(r.initial.draw),
      initialAway: r.initial === null ? null : String(r.initial.away),
      bookmakers: r.bookmakers,
      fetchedAt: r.fetchedAt,
    })),
  )
  return rows.length
}

export interface MatchOddsView extends OddsTriple {
  fetchedAt: Date
}

// Newest snapshot per match. POLL rows are only ever written pre-kickoff, so
// for locked/started matches this is also the closing snapshot.
export async function latestOddsByMatch(db: AppDatabase, matchIds: string[]): Promise<Record<string, MatchOddsView>> {
  if (matchIds.length === 0) return {}
  const rows = await db
    .selectDistinctOn([oddsSnapshot.matchId], {
      matchId: oddsSnapshot.matchId,
      oddsHome: oddsSnapshot.oddsHome,
      oddsDraw: oddsSnapshot.oddsDraw,
      oddsAway: oddsSnapshot.oddsAway,
      fetchedAt: oddsSnapshot.fetchedAt,
    })
    .from(oddsSnapshot)
    .where(inArray(oddsSnapshot.matchId, matchIds))
    .orderBy(oddsSnapshot.matchId, desc(oddsSnapshot.fetchedAt))

  const out: Record<string, MatchOddsView> = {}
  for (const row of rows) {
    out[row.matchId] = {
      home: Number(row.oddsHome),
      draw: Number(row.oddsDraw),
      away: Number(row.oddsAway),
      fetchedAt: row.fetchedAt,
    }
  }
  return out
}

// Closing odds of the actual outcome, for the scoring bonus. The closing price
// is the last pre-kickoff POLL snapshot; when none exists (provider was down
// before kickoff), a BACKFILL snapshot - the closing price recovered from the
// provider's archive, stamped at its real fetch time - stands in. A post-kickoff
// POLL would be an in-play price and never qualifies; no snapshot means no bonus.
export async function closingOddsForOutcome(
  db: AppDatabase,
  matchId: string,
  kickoffTime: Date,
  outcome: Outcome,
): Promise<number | null> {
  const pick = (row: { oddsHome: string; oddsDraw: string; oddsAway: string }) =>
    Number(outcome === 'HOME' ? row.oddsHome : outcome === 'DRAW' ? row.oddsDraw : row.oddsAway)

  const preKickoff = await db
    .select({ oddsHome: oddsSnapshot.oddsHome, oddsDraw: oddsSnapshot.oddsDraw, oddsAway: oddsSnapshot.oddsAway })
    .from(oddsSnapshot)
    .where(and(eq(oddsSnapshot.matchId, matchId), lte(oddsSnapshot.fetchedAt, kickoffTime)))
    .orderBy(desc(oddsSnapshot.fetchedAt))
    .limit(1)
  if (preKickoff.length > 0) return pick(preKickoff[0])

  const backfill = await db
    .select({ oddsHome: oddsSnapshot.oddsHome, oddsDraw: oddsSnapshot.oddsDraw, oddsAway: oddsSnapshot.oddsAway })
    .from(oddsSnapshot)
    .where(and(eq(oddsSnapshot.matchId, matchId), eq(oddsSnapshot.kind, 'BACKFILL')))
    .orderBy(desc(oddsSnapshot.fetchedAt))
    .limit(1)
  return backfill.length > 0 ? pick(backfill[0]) : null
}

export async function setMatchOddsEventRefs(
  db: AppDatabase,
  pairs: { matchId: string; ref: string; swapped?: boolean }[],
): Promise<void> {
  await Promise.all(
    pairs.map((pair) =>
      db
        .update(match)
        .set({ oddsEventRef: pair.ref, oddsEventSwapped: pair.swapped ?? false })
        .where(eq(match.id, pair.matchId)),
    ),
  )
}

// The provider reported the mapped event gone (deleted/recreated upstream):
// drop the mapping so the matcher re-claims the fixture on the next pass.
export async function clearOddsMapping(db: AppDatabase, matchId: string): Promise<void> {
  await db.update(match).set({ oddsEventRef: null, oddsEventSwapped: false }).where(eq(match.id, matchId))
}

// Every fetch attempt (priced or not) stamps the match, so the staleness
// cadence applies to unpriced events too instead of refetching them each tick.
export async function markOddsChecked(db: AppDatabase, matchIds: string[], at: Date): Promise<void> {
  if (matchIds.length === 0) return
  await db.update(match).set({ oddsCheckedAt: at }).where(inArray(match.id, matchIds))
}

// Backfilled closing odds arriving AFTER a match was scored must trigger a
// rescore (the idempotency hash doesn't cover odds): STALE rows fail the
// 'unchanged' short-circuit and take the full idempotent recompute path.
export async function markMatchesStaleForRescore(db: AppDatabase, matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return
  await db
    .update(match)
    .set({ scoringState: 'STALE' })
    .where(and(inArray(match.id, matchIds), eq(match.scoringState, 'SCORED')))
}

// Upcoming fixtures with real teams that the matcher hasn't claimed yet.
export async function unmappedUpcomingMatches(
  db: AppDatabase,
  competitionId: string,
  now: Date,
): Promise<{ id: string; homeTeam: string; awayTeam: string; kickoffTime: Date }[]> {
  return db
    .select({ id: match.id, homeTeam: match.homeTeam, awayTeam: match.awayTeam, kickoffTime: match.kickoffTime })
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        eq(match.status, 'SCHEDULED'),
        gt(match.kickoffTime, now),
        isNull(match.oddsEventRef),
        isNotNull(match.homeTeamCode),
        isNotNull(match.awayTeamCode),
      ),
    )
    .orderBy(match.kickoffTime)
}

// Bookmakers price matches well ahead; two weeks covers a whole tournament
// phase without polling far-future fixtures whose odds don't exist yet.
const POLL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

// Mapped matches kicking off within the polling window whose last fetch
// attempt is stale: every 6h, tightening to 30min in the last 2h before
// kickoff (the closing snapshot scoring relies on). Staleness is tracked per
// ATTEMPT (match.oddsCheckedAt), not per stored snapshot, so events listed but
// not yet priced honor the cadence too. Least-recently-checked first, so a
// capped batch rotates fairly instead of starving late kickoffs.
export async function matchesNeedingOdds(
  db: AppDatabase,
  competitionId: string,
  now: Date,
): Promise<{ id: string; oddsEventRef: string; oddsEventSwapped: boolean; kickoffTime: Date }[]> {
  const rows = await db
    .select({
      id: match.id,
      oddsEventRef: match.oddsEventRef,
      oddsEventSwapped: match.oddsEventSwapped,
      kickoffTime: match.kickoffTime,
      checkedAt: match.oddsCheckedAt,
    })
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        eq(match.status, 'SCHEDULED'),
        isNotNull(match.oddsEventRef),
        gt(match.kickoffTime, now),
        lte(match.kickoffTime, new Date(now.getTime() + POLL_WINDOW_MS)),
      ),
    )
    .orderBy(sql`${match.oddsCheckedAt} asc nulls first`, match.kickoffTime)

  const due: { id: string; oddsEventRef: string; oddsEventSwapped: boolean; kickoffTime: Date }[] = []
  for (const row of rows) {
    const msToKickoff = row.kickoffTime.getTime() - now.getTime()
    const staleMs = msToKickoff <= 2 * 60 * 60 * 1000 ? 30 * 60 * 1000 : 6 * 60 * 60 * 1000
    const last = row.checkedAt?.getTime() ?? null
    if (last === null || now.getTime() - last >= staleMs) {
      due.push({
        id: row.id,
        oddsEventRef: row.oddsEventRef!,
        oddsEventSwapped: row.oddsEventSwapped,
        kickoffTime: row.kickoffTime,
      })
    }
  }
  return due
}

// Finished matches a retroactive provider can still recover odds for.
export async function matchesNeedingBackfill(
  db: AppDatabase,
  competitionId: string,
): Promise<
  {
    id: string
    oddsEventRef: string | null
    oddsEventSwapped: boolean
    homeTeam: string
    awayTeam: string
    kickoffTime: Date
  }[]
> {
  return db
    .select({
      id: match.id,
      oddsEventRef: match.oddsEventRef,
      oddsEventSwapped: match.oddsEventSwapped,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffTime: match.kickoffTime,
    })
    .from(match)
    .leftJoin(oddsSnapshot, eq(oddsSnapshot.matchId, match.id))
    .where(and(eq(match.competitionId, competitionId), eq(match.status, 'FINISHED')))
    .groupBy(match.id)
    .having(sql`count(${oddsSnapshot.id}) = 0`)
    .orderBy(sql`${match.oddsCheckedAt} asc nulls first`, match.kickoffTime)
}
