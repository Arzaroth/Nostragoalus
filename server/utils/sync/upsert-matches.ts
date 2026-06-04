import { eq } from 'drizzle-orm'
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

export interface UpsertResult {
  inserted: number
  updated: number
  skipped: number
}

function toRow(m: NormalizedMatch, roundId: string) {
  return {
    providerMatchId: m.providerMatchId,
    roundId,
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

export async function upsertMatches(db: AppDatabase, matches: NormalizedMatch[]): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0 }

  for (const m of matches) {
    const roundId = await findRoundId(db, m.stage, m.matchday)
    if (!roundId) {
      result.skipped += 1
      continue
    }

    const existing = await db
      .select()
      .from(match)
      .where(eq(match.providerMatchId, m.providerMatchId))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(match).values(toRow(m, roundId))
      result.inserted += 1
      continue
    }

    // Never let a late non-final poll downgrade a match we already consider finished.
    if (existing[0].status === 'FINISHED' && m.status !== 'FINISHED') {
      result.skipped += 1
      continue
    }

    const { providerMatchId, ...mutable } = toRow(m, roundId)
    void providerMatchId
    await db.update(match).set(mutable).where(eq(match.id, existing[0].id))
    result.updated += 1
  }

  return result
}
