import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction } from '../../../db/schema'
import { countsDouble } from '../../../shared/types/match'
import { closingOddsForOutcome } from '../odds/store'
import { getScoringConfigFor } from '../scoring/store'
import type { ScoringRules } from '../scoring/config'
import { scorePredictions } from '../scoring/engine'
import { outcomeOf } from '../scoring/tiers'

export interface LiveProvisional {
  points: number
  exact: number
  outcome: number
  gd: number
}

// What every player WOULD score if the live matches finished at their current
// scoreline - same engine and bonus rules as finalize, just not persisted. Lets
// the leaderboard show provisional standings that move with the live scores.
// Returns per-user deltas for ALL users (the league board applies only its own
// rows), keyed by userId; empty when nothing is live.
export async function getLiveProvisionalPoints(
  db: AppDatabase,
  competitionId: string,
  rules?: ScoringRules,
): Promise<Map<string, LiveProvisional>> {
  const liveMatches = await db
    .select({
      id: match.id,
      stage: match.stage,
      kickoffTime: match.kickoffTime,
      fullTimeHome: match.fullTimeHome,
      fullTimeAway: match.fullTimeAway,
    })
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        inArray(match.status, ['LIVE', 'PAUSED']),
        isNotNull(match.fullTimeHome),
        isNotNull(match.fullTimeAway),
      ),
    )
  const result = new Map<string, LiveProvisional>()
  if (liveMatches.length === 0) return result

  const activeRules = rules ?? (await getScoringConfigFor(db, competitionId)).rules
  for (const m of liveMatches) {
    const locked = await db
      .select()
      .from(prediction)
      .where(and(eq(prediction.matchId, m.id), isNotNull(prediction.lockedAt)))
    if (locked.length === 0) continue

    const actual = { home: m.fullTimeHome!, away: m.fullTimeAway! }
    const actualOutcomeOdds =
      activeRules.bonusSource === 'ODDS'
        ? await closingOddsForOutcome(db, m.id, m.kickoffTime, outcomeOf(actual))
        : null
    const scores = scorePredictions({
      actual,
      rules: activeRules,
      predictions: locked.map((p) => ({ id: p.id, home: p.homeGoals, away: p.awayGoals, isJoker: p.isJoker })),
      actualOutcomeOdds,
      forceJoker: countsDouble(m.stage),
    })
    const byId = new Map(scores.map((s) => [s.id, s]))
    for (const p of locked) {
      const s = byId.get(p.id)!
      const cur = result.get(p.userId) ?? { points: 0, exact: 0, outcome: 0, gd: 0 }
      cur.points += s.totalPoints
      if (s.baseTier === 'EXACT') cur.exact += 1
      if (s.baseTier === 'EXACT' || s.baseTier === 'DIFF' || s.baseTier === 'OUTCOME') cur.outcome += 1
      if (s.baseTier === 'EXACT' || s.baseTier === 'DIFF') cur.gd += 1
      result.set(p.userId, cur)
    }
  }
  return result
}
