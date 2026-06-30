import { and, asc, eq, isNotNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction, predictionCommitment } from '../../../db/schema'
import { countsDouble, matchHasStarted, matchIsInPlay } from '../../../shared/types/match'
import type { PastPickAlternative, PastPickCounterfactual } from '../../../shared/types/past-pick'
import { closingOddsForOutcome } from '../odds/store'
import type { ScoringRules } from '../scoring/config'
import { scorePredictions, scoreSyntheticPrediction, type PredictionScore } from '../scoring/engine'
import { outcomeOf, type Scoreline } from '../scoring/tiers'
import { getScoringConfigFor } from '../scoring/store'

const NONE: PastPickCounterfactual = { scope: 'none' }

export interface PastPickOptions {
  matchId: string
  userId: string
  // Injectable for tests; production reads the competition's active config.
  rules?: ScoringRules
}

// Replays a user's OWN earlier (swapped-off) score picks for one match through
// the SAME scoring engine the live boards and finalize use, and surfaces the best
// earlier pick when it would out-score the pick they kept.
//
// Owner-only: the caller MUST have authenticated `userId`. The ledger openings
// read here are that user's own picks, and the whole thing is gated on kickoff so
// nothing reveals a pick early (matching the public reveal rule). Earlier picks
// are scored as synthetic predictions - outside the crowd-rarity denominator,
// like the consensus bot - against the field exactly as it locked: the honest
// "what would that pick have earned against everyone else's".
export async function getPastPickCounterfactual(
  db: AppDatabase,
  opts: PastPickOptions,
  now: Date = new Date(),
): Promise<PastPickCounterfactual> {
  const [m] = await db
    .select({
      competitionId: match.competitionId,
      stage: match.stage,
      status: match.status,
      kickoffTime: match.kickoffTime,
      fullTimeHome: match.fullTimeHome,
      fullTimeAway: match.fullTimeAway,
    })
    .from(match)
    .where(eq(match.id, opts.matchId))
    .limit(1)
  // Pre-kickoff (or a never-played terminal like POSTPONED): the openings stay
  // sealed and there is no scoreline to replay against.
  if (!m || !matchHasStarted(m.status)) return NONE
  if (m.fullTimeHome === null || m.fullTimeAway === null) return NONE

  // The pick the user ended up with - the one their earlier calls are measured
  // against.
  const [kept] = await db
    .select({
      id: prediction.id,
      homeGoals: prediction.homeGoals,
      awayGoals: prediction.awayGoals,
      isJoker: prediction.isJoker,
    })
    .from(prediction)
    .where(and(eq(prediction.userId, opts.userId), eq(prediction.matchId, opts.matchId)))
    .limit(1)
  if (!kept) return NONE

  // Every score the user committed to for this match, oldest first. The ledger
  // stores the opening in the clear; reading the OWNER's own rows is fine (the
  // privacy gate is the public chain endpoint, not this owner-scoped read).
  const ledger = await db
    .select({ homeGoals: predictionCommitment.homeGoals, awayGoals: predictionCommitment.awayGoals })
    .from(predictionCommitment)
    .where(and(eq(predictionCommitment.userId, opts.userId), eq(predictionCommitment.matchId, opts.matchId)))
    .orderBy(asc(predictionCommitment.seq))

  // Distinct earlier scorelines that differ from the kept pick. A->B->A leaves a
  // single "A" candidate, and the kept score is never its own alternative (so the
  // "only earlier hit duplicates the kept pick" case yields nothing).
  const seen = new Set<string>()
  const candidates: Scoreline[] = []
  for (const row of ledger) {
    if (row.homeGoals === kept.homeGoals && row.awayGoals === kept.awayGoals) continue
    const key = `${row.homeGoals}-${row.awayGoals}`
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({ home: row.homeGoals, away: row.awayGoals })
  }
  if (candidates.length === 0) return NONE

  const live = matchIsInPlay(m.status)
  const actual: Scoreline = { home: m.fullTimeHome, away: m.fullTimeAway }
  const rules = opts.rules ?? (await getScoringConfigFor(db, m.competitionId)).rules
  const actualOutcomeOdds =
    rules.bonusSource === 'ODDS' ? await closingOddsForOutcome(db, opts.matchId, m.kickoffTime, outcomeOf(actual)) : null

  // The crowd field: every locked pick on the match. The rarity histogram is
  // always the whole field, never one viewer's - same query as the per-match
  // standings.
  const field = await db
    .select({
      id: prediction.id,
      homeGoals: prediction.homeGoals,
      awayGoals: prediction.awayGoals,
      isJoker: prediction.isJoker,
    })
    .from(prediction)
    .where(and(eq(prediction.matchId, opts.matchId), isNotNull(prediction.lockedAt)))

  const input = {
    actual,
    rules,
    predictions: field.map((p) => ({ id: p.id, home: p.homeGoals, away: p.awayGoals, isJoker: p.isJoker })),
    actualOutcomeOdds,
    forceJoker: countsDouble(m.stage),
  }
  const fieldScores = new Map<string, PredictionScore>(scorePredictions(input).map((s) => [s.id, s]))

  // Re-score the kept pick through the same engine (provisional while live, and
  // ready before finalize persists it) so the comparison is apples-to-apples.
  // Falls back to a synthetic score if the pick never locked - defensive; a
  // started match should always have a locked pick in the field.
  const keptScore =
    fieldScores.get(kept.id) ??
    scoreSyntheticPrediction(input, { id: 'kept', home: kept.homeGoals, away: kept.awayGoals, isJoker: kept.isJoker })

  // The kept pick already nailed it: nothing to regret.
  if (keptScore.baseTier === 'EXACT') return NONE

  // Score each earlier pick as a synthetic, carrying the joker placement the kept
  // pick has, and keep the best (candidates is non-empty, so reduce never throws).
  const scored = candidates.map((c): PastPickAlternative => {
    const s = scoreSyntheticPrediction(input, { id: 'earlier', home: c.home, away: c.away, isJoker: kept.isJoker })
    return { home: c.home, away: c.away, points: s.totalPoints, tier: s.baseTier }
  })
  const best = scored.reduce((winner, alt) => (isBetter(alt, winner) ? alt : winner))

  // Only surface when an earlier pick would have genuinely out-scored the kept one.
  if (best.points <= keptScore.totalPoints) return NONE

  return {
    scope: live ? 'live' : 'final',
    earlier: best,
    kept: { home: kept.homeGoals, away: kept.awayGoals, points: keptScore.totalPoints, tier: keptScore.baseTier },
    cheeky: best.home === 0 && best.away === 0,
  }
}

// Higher points win; ties break deterministically by scoreline so the same
// earlier pick is chosen across runs.
function isBetter(a: PastPickAlternative, b: PastPickAlternative): boolean {
  if (a.points !== b.points) return a.points > b.points
  return a.home * 100 + a.away > b.home * 100 + b.away
}
