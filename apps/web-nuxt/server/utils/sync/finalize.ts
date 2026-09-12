import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, matchScoreEvent, prediction } from '../../../db/schema'
import { countsDouble } from '../../../shared/types/match'
import { getActiveScoringConfig, getScoringConfigFor } from '../scoring/store'
import { scorePredictions } from '../scoring/engine'
import { outcomeOf } from '../scoring/tiers'
import { closingOddsForOutcome } from '../odds/store'
import { awardChampionBonuses } from '../champion/service'
import { pruneLiveMediaForFinishedMatches } from '../match-media/service'
import { notifyMatchResults } from '../notifications/events'
import type { PendingNotification } from '../notifications/service'
import { publishUserNotification } from '../live/hub'
import { pushNotification } from '../push/send'
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
  // The caller often already holds the row (finalizeMatches selects it, then
  // used to make this re-select it by id - one extra point-select per finished
  // match per tick). Passing it in skips that; omitting it keeps the original
  // behaviour for callers that only have an id.
  preloaded?: typeof match.$inferSelect,
): Promise<ScoreOutcome> {
  let m = preloaded
  if (!m) {
    const rows = await db.select().from(match).where(eq(match.id, matchId)).limit(1)
    if (rows.length === 0) return 'skipped'
    m = rows[0]
  }
  if (m.status !== 'FINISHED' || m.fullTimeHome === null || m.fullTimeAway === null) return 'skipped'

  const { version, rules } = context ?? (await getScoringConfigFor(db, m.competitionId))
  const hash = resultHashOf(m.status, m.fullTimeHome, m.fullTimeAway)
  if (m.scoringState === 'SCORED' && m.resultHash === hash && m.scoredAtVersion === version) {
    return 'unchanged'
  }

  const locked = await db
    .select()
    .from(prediction)
    .where(and(eq(prediction.matchId, matchId), isNotNull(prediction.lockedAt)))

  // Closing odds of the actual outcome feed the ODDS bonus. Gated on the
  // config so the default CROWD path costs no extra query; the resolver only
  // reads append-only pre-kickoff snapshots, so rescoring stays idempotent.
  const actualOutcomeOdds =
    rules.bonusSource === 'ODDS'
      ? await closingOddsForOutcome(db, matchId, m.kickoffTime, outcomeOf({ home: m.fullTimeHome, away: m.fullTimeAway }))
      : null

  const scores = scorePredictions({
    actual: { home: m.fullTimeHome, away: m.fullTimeAway },
    rules,
    predictions: locked.map((p) => ({ id: p.id, home: p.homeGoals, away: p.awayGoals, isJoker: p.isJoker })),
    actualOutcomeOdds,
    forceJoker: countsDouble(m.stage),
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
  // Matches whose points changed this tick (scored or voided), so the task can
  // broadcast them - finalize is what sets the points, and clients need telling
  // (scores:poll only broadcasts the FINISHED status, before finalize scores).
  changedMatchIds: string[]
}

export async function finalizeMatches(db: AppDatabase, now: Date = new Date()): Promise<FinalizeResult> {
  // The whole tick is one transaction: lock/unlock, every match score, every
  // champion award and every void land together or roll back together. A crash
  // mid-tick leaves the previous consistent state, never a half-scored round.
  // Result/champion notifications created in the tx push live only AFTER it
  // commits (collected here, flushed below) so a rolled-back tick can't leave
  // the bell showing notifications whose rows never persisted.
  const pending: PendingNotification[] = []
  const result = await db.transaction(async (tx) => {
    const locked = await lockDuePredictions(tx, now)
    const unlocked = await unlockFuturePredictions(tx, now)

    // Each competition can carry its own scoring override, so resolve (and
    // memoize) the config per competition rather than once for the whole tick.
    const configCache = new Map<string, ScoringContext>()
    const configFor = async (competitionId: string): Promise<ScoringContext> => {
      const cached = configCache.get(competitionId)
      if (cached) return cached
      const resolved = await getScoringConfigFor(tx, competitionId)
      configCache.set(competitionId, resolved)
      return resolved
    }

    const changedMatchIds: string[] = []
    // Only matches that are not already settled. The full FINISHED scan this
    // replaces re-read and re-hashed every match ever played on every tick,
    // which at a one-minute cadence is the heaviest thing in the task.
    //
    // "Settled" is the same three-part test scoreMatchRow applies, pushed into
    // SQL so the rows never load: the state (PENDING never scored, STALE when
    // late odds forced a rescore - see markMatchesStaleForRescore), the result
    // hash, which is just `status:home:away` so a score correction that leaves
    // the state SCORED is still caught, and the config version. The version is
    // per competition, so the scan runs once per competition with that
    // competition's resolved version rather than as one table-wide query -
    // a handful of indexed lookups (match_scoring_state_idx) that return
    // nothing in the steady state.
    //
    // The version trigger is deliberately kept even though saveScoringConfig
    // recomputes in the same transaction: finalize is the backstop if a version
    // ever moves by another route, which finalize.test.ts pins directly.
    const competitionIds = (
      await tx.selectDistinct({ id: match.competitionId }).from(match).where(eq(match.status, 'FINISHED'))
    ).map((r) => r.id)

    const finished: (typeof match.$inferSelect)[] = []
    for (const cid of competitionIds) {
      const { version } = await configFor(cid)
      const rows = await tx
        .select()
        .from(match)
        .where(
          and(
            eq(match.competitionId, cid),
            eq(match.status, 'FINISHED'),
            isNotNull(match.fullTimeHome),
            isNotNull(match.fullTimeAway),
            or(
              ne(match.scoringState, 'SCORED'),
              sql`${match.resultHash} is distinct from ('FINISHED:' || ${match.fullTimeHome} || ':' || ${match.fullTimeAway})`,
              sql`${match.scoredAtVersion} is distinct from ${version}`,
            ),
          ),
        )
      finished.push(...rows)
    }
    let scored = 0
    for (const m of finished) {
      // The row is already loaded; hand it over so scoreMatchRow does not
      // re-select it by id.
      if ((await scoreMatchRow(tx, m.id, await configFor(m.competitionId), m)) === 'scored') {
        scored += 1
        changedMatchIds.push(m.id)
        await notifyMatchResults(tx, m.id, pending)
      }
    }

    // The champion bonus rides its own query rather than the scoring scan. It
    // is re-awarded on every tick on purpose (idempotent, and it is the belt to
    // the scoring pass's braces), so narrowing the scan above must not quietly
    // stop it. Only a decided FINAL can award it, which is at most one row per
    // competition. The best-scorer bonus is NOT here: it depends on goal_event,
    // which the detail sync populates after this transaction - the finalize task
    // awards it once details are fresh.
    const decidedFinals = await tx
      .select()
      .from(match)
      .where(
        and(
          eq(match.status, 'FINISHED'),
          eq(match.stage, 'FINAL'),
          inArray(match.winner, ['HOME', 'AWAY']),
        ),
      )
    for (const m of decidedFinals) {
      if (!countsDouble(m.stage)) continue
      const winnerCode = m.winner === 'HOME' ? m.homeTeamCode : m.awayTeamCode
      await awardChampionBonuses(tx, m.competitionId, winnerCode, pending)
    }

    // Finished matches shed their now-dead LIVE watch links.
    await pruneLiveMediaForFinishedMatches(tx)

    // Same shape as the scoring scan: the already-voided rows were being loaded
    // and skipped in JS on every tick. VOID is terminal for these statuses.
    const voidable = await tx
      .select()
      .from(match)
      .where(and(inArray(match.status, ['CANCELLED', 'POSTPONED']), ne(match.scoringState, 'VOID')))
    let voided = 0
    for (const m of voidable) {
      if (m.status === 'POSTPONED' && m.kickoffTime > new Date(now.getTime() - POSTPONED_VOID_AFTER_MS)) continue
      await voidMatch(tx, m.id)
      voided += 1
      changedMatchIds.push(m.id)
    }

    return { locked, unlocked, scored, voided, changedMatchIds }
  })

  // Committed: now it is safe to push the result/champion notifications live,
  // and to fire their (best-effort) web pushes.
  for (const p of pending) {
    publishUserNotification(p.userId, p.dto)
    void pushNotification(db, p.userId, p.dto.data).catch(() => {})
  }
  return result
}
