import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import type { MatchLineups } from '#shared/types/match'
import { matchLineups } from '../../../db/schema'
import { applyCoords, deriveSofascorePositions } from './sofascore-positions'
import { fetchSofascoreLineups, type SofascoreLineupsOptions } from './sofascore-lineups'

// Pending line-ups can still change (the announced XI arrives, subs flip a side),
// so refresh every minute; a finished line-up is frozen and served from the row
// forever (notably so we stop re-hitting the fragile Sofascore refiner).
const TTL_MS = 60 * 1000

export interface StoredLineups {
  hit: boolean
  data?: MatchLineups | null
}

// The match_lineups row is the cache: served forever once final, else within the
// TTL while the XI can still change. A miss (no row, or a stale pending one)
// returns hit:false so the route fetches fresh.
export async function getStoredLineups(db: AppDatabase, matchId: string, now = Date.now()): Promise<StoredLineups> {
  const stored = (await db.select().from(matchLineups).where(eq(matchLineups.matchId, matchId)).limit(1))[0]
  if (stored && (stored.final || now - stored.fetchedAt.getTime() < TTL_MS)) return { hit: true, data: stored.data }
  return { hit: false }
}

export interface LineupMeta {
  status: string
  oddsProvider: string | null
  oddsEventRef: string | null
  oddsEventSwapped: boolean
}

export interface StoreLineupsOptions {
  sofascore?: SofascoreLineupsOptions
  now?: number
}

// Refine a provider line-up with Sofascore positions (when the base feed shipped
// none and the match has a Sofascore odds anchor) and persist it. FIFA stays the
// source of truth for the XI; Sofascore only adds coordinates, by shirt.
export async function storeLineups(
  db: AppDatabase,
  matchId: string,
  base: MatchLineups | null,
  meta: LineupMeta,
  opts: StoreLineupsOptions = {},
): Promise<MatchLineups | null> {
  if (!base) return null
  const now = opts.now ?? Date.now()
  let lineups = base
  const needsCoords = lineups.available && lineups.home.startingXI.some((p) => p.x == null)
  if (needsCoords && meta.oddsProvider === 'sofascore' && meta.oddsEventRef) {
    const resp = await fetchSofascoreLineups(meta.oddsEventRef, opts.sofascore)
    if (resp) {
      const pos = deriveSofascorePositions(resp)
      // oddsEventSwapped: Sofascore lists our away team as its home side.
      const homeCoords = meta.oddsEventSwapped ? pos.away : pos.home
      const awayCoords = meta.oddsEventSwapped ? pos.home : pos.away
      lineups = { ...lineups, home: applyCoords(lineups.home, homeCoords), away: applyCoords(lineups.away, awayCoords) }
    }
  }
  const final = meta.status === 'FINISHED' && lineups.available
  const fetchedAt = new Date(now)
  await db
    .insert(matchLineups)
    .values({ matchId, data: lineups, final, fetchedAt })
    .onConflictDoUpdate({ target: matchLineups.matchId, set: { data: lineups, final, fetchedAt } })
  return lineups
}
