import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, max, sql } from 'drizzle-orm'
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

// Closing odds of the actual outcome, for the scoring bonus. Only snapshots
// at/before kickoff qualify - a post-kickoff price would be an in-play price,
// and no snapshot honestly means no bonus.
export async function closingOddsForOutcome(
  db: AppDatabase,
  matchId: string,
  kickoffTime: Date,
  outcome: Outcome,
): Promise<number | null> {
  const rows = await db
    .select({ oddsHome: oddsSnapshot.oddsHome, oddsDraw: oddsSnapshot.oddsDraw, oddsAway: oddsSnapshot.oddsAway })
    .from(oddsSnapshot)
    .where(and(eq(oddsSnapshot.matchId, matchId), lte(oddsSnapshot.fetchedAt, kickoffTime)))
    .orderBy(desc(oddsSnapshot.fetchedAt))
    .limit(1)
  if (rows.length === 0) return null
  const row = rows[0]
  const value = outcome === 'HOME' ? row.oddsHome : outcome === 'DRAW' ? row.oddsDraw : row.oddsAway
  return Number(value)
}

export async function setMatchOddsEventRefs(
  db: AppDatabase,
  pairs: { matchId: string; ref: string; swapped?: boolean }[],
): Promise<void> {
  for (const pair of pairs) {
    await db
      .update(match)
      .set({ oddsEventRef: pair.ref, oddsEventSwapped: pair.swapped ?? false })
      .where(eq(match.id, pair.matchId))
  }
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

// Mapped upcoming matches whose newest snapshot is stale per the cadence rules:
// every 6h inside the 72h pre-match window, tightening to 30min in the last 2h.
export async function matchesNeedingOdds(
  db: AppDatabase,
  competitionIds: string[],
  now: Date,
): Promise<{ id: string; oddsEventRef: string; oddsEventSwapped: boolean; kickoffTime: Date }[]> {
  if (competitionIds.length === 0) return []
  const horizon = new Date(now.getTime() + 72 * 60 * 60 * 1000)
  const rows = await db
    .select({
      id: match.id,
      oddsEventRef: match.oddsEventRef,
      oddsEventSwapped: match.oddsEventSwapped,
      kickoffTime: match.kickoffTime,
      lastFetchedAt: max(oddsSnapshot.fetchedAt),
    })
    .from(match)
    .leftJoin(oddsSnapshot, eq(oddsSnapshot.matchId, match.id))
    .where(
      and(
        inArray(match.competitionId, competitionIds),
        eq(match.status, 'SCHEDULED'),
        isNotNull(match.oddsEventRef),
        gt(match.kickoffTime, now),
        lte(match.kickoffTime, horizon),
      ),
    )
    .groupBy(match.id)
    .orderBy(match.kickoffTime)

  const due: { id: string; oddsEventRef: string; oddsEventSwapped: boolean; kickoffTime: Date }[] = []
  for (const row of rows) {
    const msToKickoff = row.kickoffTime.getTime() - now.getTime()
    const staleMs = msToKickoff <= 2 * 60 * 60 * 1000 ? 30 * 60 * 1000 : 6 * 60 * 60 * 1000
    const last = row.lastFetchedAt?.getTime() ?? null
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
  const rows = await db
    .select({
      id: match.id,
      oddsEventRef: match.oddsEventRef,
      oddsEventSwapped: match.oddsEventSwapped,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      kickoffTime: match.kickoffTime,
      snapshots: sql<number>`count(${oddsSnapshot.id})`,
    })
    .from(match)
    .leftJoin(oddsSnapshot, eq(oddsSnapshot.matchId, match.id))
    .where(and(eq(match.competitionId, competitionId), eq(match.status, 'FINISHED')))
    .groupBy(match.id)
    .orderBy(match.kickoffTime)
  return rows
    .filter((r) => Number(r.snapshots) === 0)
    .map(({ snapshots: _snapshots, ...rest }) => rest)
}
