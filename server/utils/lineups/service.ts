import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import type { MatchLineups } from '#shared/types/match'
import { match, matchLineups } from '../../../db/schema'
import { providerForCompetition } from '../providers'
import { getCompetitionById } from '../competitions/store'
import { resolveCompetitionSeason } from '../sync/competition'
import { applyCoords, deriveSofascorePositions } from './sofascore-positions'
import { fetchSofascoreLineups, type SofascoreLineupsOptions } from './sofascore-lineups'

// Pending line-ups can still change (the announced XI arrives, subs flip a side),
// so refresh every minute; a finished line-up is frozen and served from the row
// forever (notably so we stop re-hitting the fragile Sofascore refiner).
const TTL_MS = 60 * 1000

export interface LineupsServiceOptions {
  sofascore?: SofascoreLineupsOptions
  now?: number
}

export async function getMatchLineups(db: AppDatabase, matchId: string, opts: LineupsServiceOptions = {}): Promise<MatchLineups | null> {
  const now = opts.now ?? Date.now()
  const stored = await db.select().from(matchLineups).where(eq(matchLineups.matchId, matchId)).limit(1)
  const cached = stored[0]
  if (cached && (cached.final || now - cached.fetchedAt.getTime() < TTL_MS)) return cached.data

  const rows = await db
    .select({
      providerMatchId: match.providerMatchId,
      providerStageId: match.providerStageId,
      competitionId: match.competitionId,
      status: match.status,
      oddsEventRef: match.oddsEventRef,
      oddsEventSwapped: match.oddsEventSwapped,
    })
    .from(match)
    .where(eq(match.id, matchId))
    .limit(1)
  if (rows.length === 0) return null
  const m = rows[0]
  const competition = await getCompetitionById(db, m.competitionId)
  if (!competition) return cached?.data ?? null
  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
  if (!provider.getMatchLineups) return cached?.data ?? null

  let lineups: MatchLineups | null
  try {
    lineups = await provider.getMatchLineups({ stageId: m.providerStageId ?? undefined, matchId: m.providerMatchId })
  } catch {
    // Upstream hiccup: keep whatever we last stored rather than blanking the tab.
    return cached?.data ?? null
  }
  if (!lineups) return cached?.data ?? null

  // Refine the coarse FIFA position buckets with Sofascore's real placement when
  // the base feed shipped no coordinates and this match has a Sofascore anchor.
  const needsCoords = lineups.available && lineups.home.startingXI.some((p) => p.x == null)
  if (needsCoords && competition.oddsProvider === 'sofascore' && m.oddsEventRef) {
    const resp = await fetchSofascoreLineups(m.oddsEventRef, opts.sofascore)
    if (resp) {
      const pos = deriveSofascorePositions(resp)
      // oddsEventSwapped: Sofascore lists our away team as its home side.
      const homeCoords = m.oddsEventSwapped ? pos.away : pos.home
      const awayCoords = m.oddsEventSwapped ? pos.home : pos.away
      lineups = { ...lineups, home: applyCoords(lineups.home, homeCoords), away: applyCoords(lineups.away, awayCoords) }
    }
  }

  const final = m.status === 'FINISHED' && lineups.available
  const fetchedAt = new Date(now)
  await db
    .insert(matchLineups)
    .values({ matchId, data: lineups, final, fetchedAt })
    .onConflictDoUpdate({ target: matchLineups.matchId, set: { data: lineups, final, fetchedAt } })
  return lineups
}
