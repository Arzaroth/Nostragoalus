import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, matchScoreEvent, prediction } from '../../../db/schema'
import { getActiveScoringConfig } from '../scoring/store'
import { scorePredictions } from '../scoring/engine'
import { awardChampionBonuses } from '../champion/service'
import { resultHashOf } from './upsert-matches'
import { lockDuePredictions, unlockFuturePredictions } from './live-window'

const POSTPONED_VOID_AFTER_MS = 3 * 24 * 60 * 60 * 1000

export type ScoreOutcome = 'scored' | 'unchanged' | 'skipped'

interface ScoringContext {
  version: number
  rules: Awaited<ReturnType<typeof getActiveScoringConfig>>['rules']
}

export async function scoreMatchRow(
  db: AppDatabase,
  matchId: string,
  context?: ScoringContext,
): Promise<ScoreOutcome> {
  const rows = await db.select().from(match).where(eq(match.id, matchId)).limit(1)
  if (rows.length === 0) return 'skipped'

  const m = rows[0]
  if (m.status !== 'FINISHED' || m.fullTimeHome === null || m.fullTimeAway === null) return 'skipped'

  const { version, rules } = context ?? (await getActiveScoringConfig(db))
  const hash = resultHashOf(m.status, m.fullTimeHome, m.fullTimeAway)
  if (m.scoringState === 'SCORED' && m.resultHash === hash && m.scoredAtVersion === version) {
    return 'unchanged'
  }

  const locked = await db
    .select()
    .from(prediction)
    .where(and(eq(prediction.matchId, matchId), isNotNull(prediction.lockedAt)))

  const scores = scorePredictions({
    actual: { home: m.fullTimeHome, away: m.fullTimeAway },
    rules,
    predictions: locked.map((p) => ({ id: p.id, home: p.homeGoals, away: p.awayGoals, isJoker: p.isJoker })),
    forceJoker: m.stage === 'FINAL',
  })
  const scoreById = new Map(scores.map((s) => [s.id, s]))

  // No inner transaction: the caller owns the atomic boundary (finalizeMatches
  // wraps the whole tick) so partial scoring can't survive a crash.
  for (const p of locked) {
    const s = scoreById.get(p.id)!
    await db
      .update(prediction)
      .set({
        basePoints: s.basePoints,
        baseTier: s.baseTier,
        bonusPoints: s.bonusPoints,
        bonusSource: s.bonusSource,
        crowdShare: s.crowdShare === null ? null : String(s.crowdShare),
        jokerMultiplierApplied: String(s.jokerMultiplier),
        totalPoints: s.totalPoints,
        scoredAtVersion: version,
        scoredAt: new Date(),
      })
      .where(eq(prediction.id, p.id))
  }

  await db
    .update(match)
    .set({ scoringState: 'SCORED', resultHash: hash, scoredAtVersion: version, scoredAt: new Date() })
    .where(eq(match.id, matchId))

  await db.insert(matchScoreEvent).values({
    matchId,
    status: m.status,
    fullTimeHome: m.fullTimeHome,
    fullTimeAway: m.fullTimeAway,
    resultHash: hash,
  })

  return 'scored'
}

export async function voidMatch(db: AppDatabase, matchId: string): Promise<void> {
  await db
    .update(prediction)
    .set({
      basePoints: null,
      baseTier: null,
      bonusPoints: null,
      bonusSource: null,
      crowdShare: null,
      jokerMultiplierApplied: null,
      totalPoints: null,
      scoredAt: null,
      scoredAtVersion: null,
      isJoker: false,
    })
    .where(eq(prediction.matchId, matchId))

  await db.update(match).set({ scoringState: 'VOID' }).where(eq(match.id, matchId))
}

export interface FinalizeResult {
  locked: number
  unlocked: number
  scored: number
  voided: number
}

export async function finalizeMatches(db: AppDatabase, now: Date = new Date()): Promise<FinalizeResult> {
  // The whole tick is one transaction: lock/unlock, every match score, every
  // champion award and every void land together or roll back together. A crash
  // mid-tick leaves the previous consistent state, never a half-scored round.
  return db.transaction(async (tx) => {
    const locked = await lockDuePredictions(tx, now)
    const unlocked = await unlockFuturePredictions(tx, now)
    const context = await getActiveScoringConfig(tx)

    const finished = await tx.select().from(match).where(eq(match.status, 'FINISHED'))
    let scored = 0
    for (const m of finished) {
      if (m.fullTimeHome === null || m.fullTimeAway === null) continue
      if ((await scoreMatchRow(tx, m.id, context)) === 'scored') scored += 1
      // A decided final's champion bonus is awarded in the same transaction as
      // its scoring, so the two can never disagree.
      if (m.stage === 'FINAL' && (m.winner === 'HOME' || m.winner === 'AWAY')) {
        const winnerCode = m.winner === 'HOME' ? m.homeTeamCode : m.awayTeamCode
        await awardChampionBonuses(tx, m.competitionId, winnerCode, context.rules.championBonus)
      }
    }

    const voidable = await tx.select().from(match).where(inArray(match.status, ['CANCELLED', 'POSTPONED']))
    let voided = 0
    for (const m of voidable) {
      if (m.scoringState === 'VOID') continue
      if (m.status === 'POSTPONED' && m.kickoffTime > new Date(now.getTime() - POSTPONED_VOID_AFTER_MS)) continue
      await voidMatch(tx, m.id)
      voided += 1
    }

    return { locked, unlocked, scored, voided }
  })
}
