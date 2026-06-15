import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'
import type { NormalizedMatch } from '../../../shared/types/match'
import { findRoundId } from './rounds'

export function resultHashOf(
  status: string,
  fullTimeHome: number | null,
  fullTimeAway: number | null,
): string {
  return `${status}:${fullTimeHome ?? ''}:${fullTimeAway ?? ''}`
}

// A status/score change on an already-known match, carried out of the upsert so
// the live triggers (kickoff, goal) can fire without re-querying. Only existing
// matches produce one (a brand-new row has no previous state to compare).
export interface MatchTransition {
  matchId: string
  homeTeam: string
  awayTeam: string
  prevStatus: string
  status: string
  prevHome: number | null
  prevAway: number | null
  home: number | null
  away: number | null
}

export interface UpsertResult {
  inserted: number
  updated: number
  skipped: number
  changedMatchIds: string[]
  transitions: MatchTransition[]
}

// Fields that may change between syncs. competitionId/roundId are intentionally
// excluded: they are assigned once at insert and must stay stable.
function mutableFields(m: NormalizedMatch) {
  return {
    stage: m.stage,
    groupName: m.group,
    homeTeam: m.homeTeam.name,
    awayTeam: m.awayTeam.name,
    homeTeamCode: m.homeTeam.code,
    awayTeamCode: m.awayTeam.code,
    kickoffTime: new Date(m.kickoffTime),
    status: m.status,
    fullTimeHome: m.score.fullTime.home,
    fullTimeAway: m.score.fullTime.away,
    halfTimeHome: m.score.halfTime?.home ?? null,
    halfTimeAway: m.score.halfTime?.away ?? null,
    extraTimeHome: m.score.extraTime?.home ?? null,
    extraTimeAway: m.score.extraTime?.away ?? null,
    penaltiesHome: m.score.penalties?.home ?? null,
    penaltiesAway: m.score.penalties?.away ?? null,
    winner: m.winner,
  }
}

export async function upsertMatches(
  db: AppDatabase,
  competitionId: string,
  matches: NormalizedMatch[],
): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0, changedMatchIds: [], transitions: [] }

  for (const m of matches) {
    const existing = await db
      .select()
      .from(match)
      .where(and(eq(match.competitionId, competitionId), eq(match.providerMatchId, m.providerMatchId)))
      .limit(1)

    if (existing.length === 0) {
      const roundId = await findRoundId(db, competitionId, m.stage, m.matchday)
      if (!roundId) {
        result.skipped += 1
        continue
      }
      await db.insert(match).values({
        competitionId,
        providerMatchId: m.providerMatchId,
        providerStageId: m.providerStageId ?? null,
        roundId,
        ...mutableFields(m),
      })
      result.inserted += 1
      continue
    }

    const prev = existing[0]
    // Never let a late non-final poll downgrade a match we already consider finished.
    if (prev.status === 'FINISHED' && m.status !== 'FINISHED') {
      result.skipped += 1
      continue
    }

    // A side correction invalidates the odds mapping: the stored swapped flag
    // was computed against the old orientation, so keeping it would invert
    // every later snapshot. Drop the mapping; the matcher re-claims it.
    const sidesChanged = prev.homeTeam !== m.homeTeam.name || prev.awayTeam !== m.awayTeam.name
    await db
      .update(match)
      .set({
        ...mutableFields(m),
        ...(sidesChanged && prev.oddsEventRef !== null ? { oddsEventRef: null, oddsEventSwapped: false } : {}),
      })
      .where(eq(match.id, prev.id))
    result.updated += 1

    const changed =
      prev.status !== m.status ||
      prev.fullTimeHome !== m.score.fullTime.home ||
      prev.fullTimeAway !== m.score.fullTime.away
    if (changed) {
      result.changedMatchIds.push(prev.id)
      result.transitions.push({
        matchId: prev.id,
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
        prevStatus: prev.status,
        status: m.status,
        prevHome: prev.fullTimeHome,
        prevAway: prev.fullTimeAway,
        home: m.score.fullTime.home,
        away: m.score.fullTime.away,
      })
    }
  }

  return result
}
