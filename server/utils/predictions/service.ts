import { and, eq, gt, inArray, lte, ne, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import {
  competition as competitionTable,
  league,
  leagueMember,
  leaguePrediction,
  match,
  prediction,
  round,
  user as userTable,
} from '../../../db/schema'
import { isSingleMatchStage } from '../../../shared/types/match'
import { ForbiddenError, LockedError, NotFoundError, ValidationError } from '../errors'
import { deletePickReminder } from '../notifications/reminders'
import { appendPredictionCommitment } from '../commitment/service'
import { hardRoundBudget, type LeagueMode } from '../leagues/modes'
import { pickCompleteness, summarizeCompleteness, type CompletenessSummary } from '../leagues/completeness'

// Aggregate counters for the "my stats" strip (points/rank come from the leaderboard).
export async function getMyStats(db: AppDatabase, userId: string, competitionId: string) {
  const rows = await db
    .select({
      predictions: sql<number>`count(*)`.mapWith(Number),
      jokers: sql<number>`count(*) filter (where ${prediction.isJoker})`.mapWith(Number),
    })
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .where(and(eq(prediction.userId, userId), eq(match.competitionId, competitionId)))
  return rows[0]
}

export interface UpsertPredictionInput {
  userId: string
  matchId: string
  home: number
  away: number
  // true when entered via the W/D/L quick-pick (a canonical scoreline). Marks
  // the pick as outcome-only so NORMAL leagues nudge for a real score.
  isOutcomeOnly?: boolean
  // HARD-league confidence stake; null leaves it unset.
  wager?: number | null
}

function assertValidGoals(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 99) {
    throw new ValidationError(`${label} must be an integer between 0 and 99`)
  }
}

function assertValidWager(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 999) {
    throw new ValidationError('wager must be an integer between 0 and 999')
  }
}

// Load a match that is open for a pick, or throw: missing -> NotFound, kicked off
// -> Locked, TBD teams -> Validation. Shared by base and league-override writes.
async function loadOpenMatch(db: AppDatabase, matchId: string, now: Date) {
  const [row] = await db.select().from(match).where(eq(match.id, matchId)).limit(1)
  if (!row) throw new NotFoundError('match not found')
  if (now >= row.kickoffTime) throw new LockedError()
  // Knockout placeholders ("Winner Group A") aren't predictable until both teams are known.
  if (!row.homeTeamCode || !row.awayTeamCode) throw new ValidationError('teams not confirmed yet')
  return row
}

// Reject a stake that would push the round's total over the fixed confidence
// budget. Scoped to a column (base prediction.wager, or a league override's) so
// the same check guards both write paths. Run inside the write transaction.
async function assertWagerWithinBudget(
  tx: AppDatabase,
  roundId: string,
  wager: number,
  otherStakes: number,
): Promise<void> {
  const [{ matches }] = await tx
    .select({ matches: sql<number>`count(*)`.mapWith(Number) })
    .from(match)
    .where(eq(match.roundId, roundId))
  if (otherStakes + wager > hardRoundBudget(matches)) {
    throw new ValidationError('stake exceeds the round confidence budget')
  }
}

export async function upsertPrediction(
  db: AppDatabase,
  input: UpsertPredictionInput,
  now: Date = new Date(),
): Promise<string> {
  assertValidGoals(input.home, 'home goals')
  assertValidGoals(input.away, 'away goals')
  if (input.wager != null) assertValidWager(input.wager)

  const matchRow = await loadOpenMatch(db, input.matchId, now)

  // One transaction: the pick and its tamper-evidence commitment land or roll
  // back together, so the ledger can never disagree with the stored prediction.
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ homeGoals: prediction.homeGoals, awayGoals: prediction.awayGoals })
      .from(prediction)
      .where(and(eq(prediction.userId, input.userId), eq(prediction.matchId, input.matchId)))
      .limit(1)

    // A confidence stake (HARD leagues) shares one round budget across the base
    // pick. Reject a stake that would push the round total over it.
    if (input.wager != null && input.wager > 0) {
      const [{ other }] = await tx
        .select({ other: sql<number>`coalesce(sum(${prediction.wager}), 0)`.mapWith(Number) })
        .from(prediction)
        .where(
          and(
            eq(prediction.userId, input.userId),
            eq(prediction.roundId, matchRow.roundId),
            ne(prediction.matchId, input.matchId),
          ),
        )
      await assertWagerWithinBudget(tx, matchRow.roundId, input.wager, other)
    }

    // Atomic upsert keyed on the prediction_user_match_uq index. A plain
    // select-then-insert raced on concurrent double-submits (autosave + manual
    // save, retries), with the loser hitting the unique constraint as a 500.
    // Only the fields the caller supplied are overwritten on conflict, so a
    // score edit never wipes an existing wager and vice-versa.
    const [row] = await tx
      .insert(prediction)
      .values({
        userId: input.userId,
        matchId: input.matchId,
        roundId: matchRow.roundId,
        homeGoals: input.home,
        awayGoals: input.away,
        isOutcomeOnly: input.isOutcomeOnly ?? false,
        wager: input.wager ?? null,
      })
      .onConflictDoUpdate({
        target: [prediction.userId, prediction.matchId],
        set: {
          homeGoals: input.home,
          awayGoals: input.away,
          ...(input.isOutcomeOnly !== undefined ? { isOutcomeOnly: input.isOutcomeOnly } : {}),
          ...(input.wager !== undefined ? { wager: input.wager } : {}),
        },
      })
      .returning({ id: prediction.id })

    // Append a commitment only when the pick actually changed - autosave re-fires
    // the same score, and that should not grow the ledger.
    if (!existing || existing.homeGoals !== input.home || existing.awayGoals !== input.away) {
      await appendPredictionCommitment(
        tx,
        { predictionId: row.id, userId: input.userId, matchId: input.matchId, homeGoals: input.home, awayGoals: input.away },
        now,
      )
    }

    // The pick is in: any missing-pick reminder for this match is now fulfilled.
    await deletePickReminder(tx, input.userId, input.matchId)
    return row.id
  })
}

// Prediction joined with enough match/round context to render a readable list.
const predictionView = {
  id: prediction.id,
  userId: prediction.userId,
  matchId: prediction.matchId,
  roundId: prediction.roundId,
  homeGoals: prediction.homeGoals,
  awayGoals: prediction.awayGoals,
  isJoker: prediction.isJoker,
  baseTier: prediction.baseTier,
  totalPoints: prediction.totalPoints,
  basePoints: prediction.basePoints,
  bonusPoints: prediction.bonusPoints,
  crowdShare: prediction.crowdShare,
  jokerMultiplierApplied: prediction.jokerMultiplierApplied,
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  homeTeamCode: match.homeTeamCode,
  awayTeamCode: match.awayTeamCode,
  kickoffTime: match.kickoffTime,
  status: match.status,
  stage: match.stage,
  fullTimeHome: match.fullTimeHome,
  fullTimeAway: match.fullTimeAway,
  penaltiesHome: match.penaltiesHome,
  penaltiesAway: match.penaltiesAway,
  roundLabel: round.label,
  roundSort: round.sortOrder,
}

// A single prediction with the match/competition/owner context a share card
// needs. No ownership filter here - the caller (mint) checks ownership before
// signing a token, and the public render trusts the signed token.
export async function getPredictionForShare(db: AppDatabase, predictionId: string) {
  const rows = await db
    .select({
      ...predictionView,
      group: match.groupName,
      competitionSlug: competitionTable.slug,
      competitionName: competitionTable.name,
      ownerName: userTable.name,
    })
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .innerJoin(round, eq(round.id, prediction.roundId))
    .innerJoin(competitionTable, eq(competitionTable.id, match.competitionId))
    .innerJoin(userTable, eq(userTable.id, prediction.userId))
    .where(eq(prediction.id, predictionId))
    .limit(1)
  return rows[0] ?? null
}

// Resolve the caller's OWN prediction for a match to the ref the share-mint
// route needs. Querying by userId makes ownership intrinsic: you can only mint a
// token for a pick that is yours.
export async function getOwnPredictionRef(db: AppDatabase, userId: string, matchId: string) {
  const rows = await db
    .select({ id: prediction.id, kickoffTime: match.kickoffTime })
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .where(and(eq(prediction.userId, userId), eq(prediction.matchId, matchId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getMyPredictions(db: AppDatabase, userId: string, competitionId?: string) {
  return db
    .select(predictionView)
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .innerJoin(round, eq(round.id, prediction.roundId))
    .where(competitionId ? and(eq(prediction.userId, userId), eq(match.competitionId, competitionId)) : eq(prediction.userId, userId))
    .orderBy(match.kickoffTime)
}

// Another user's predictions are only revealed for matches that have kicked off,
// so picks can't be copied before lock.
export async function getUserPublicPredictions(
  db: AppDatabase,
  userId: string,
  now: Date = new Date(),
  competitionId?: string,
  // Admins see every pick, including not-yet-kicked-off matches (the kickoff
  // gate is a fairness rule for regular viewers, not for admins).
  includeUpcoming = false,
) {
  const base = [eq(prediction.userId, userId)]
  if (!includeUpcoming) base.push(lte(match.kickoffTime, now))
  if (competitionId) base.push(eq(match.competitionId, competitionId))
  return db
    .select({ ...predictionView, competitionSlug: competitionTable.slug, competitionName: competitionTable.name })
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .innerJoin(round, eq(round.id, prediction.roundId))
    .innerJoin(competitionTable, eq(competitionTable.id, match.competitionId))
    .where(and(...base))
    .orderBy(match.kickoffTime)
}

export interface SetJokerInput {
  userId: string
  matchId: string
  isJoker: boolean
}

export async function setJoker(db: AppDatabase, input: SetJokerInput, now: Date = new Date()): Promise<void> {
  const rows = await db.select().from(match).where(eq(match.id, input.matchId)).limit(1)
  if (rows.length === 0) throw new NotFoundError('match not found')
  if (now >= rows[0].kickoffTime) throw new LockedError()
  // Single-match rounds have no joker choice - the final doubles for everyone.
  if (isSingleMatchStage(rows[0].stage)) {
    throw new ValidationError('no joker on single-match rounds')
  }
  // Can't joker a fixture whose teams aren't decided yet (same as predicting it).
  if (!rows[0].homeTeamCode || !rows[0].awayTeamCode) {
    throw new ValidationError('teams not confirmed yet')
  }

  const preds = await db
    .select()
    .from(prediction)
    .where(and(eq(prediction.userId, input.userId), eq(prediction.matchId, input.matchId)))
    .limit(1)
  if (preds.length === 0) throw new NotFoundError('prediction not found')

  if (input.isJoker) {
    // One joker per round: move it from the current joker - but only if that match
    // hasn't kicked off yet (a joker on a started match is already committed there).
    const current = await db
      .select({ id: prediction.id, kickoffTime: match.kickoffTime })
      .from(prediction)
      .innerJoin(match, eq(match.id, prediction.matchId))
      .where(
        and(
          eq(prediction.userId, input.userId),
          eq(prediction.roundId, rows[0].roundId),
          eq(prediction.isJoker, true),
        ),
      )
      .limit(1)
    if (current.length > 0 && current[0].id !== preds[0].id) {
      if (now >= current[0].kickoffTime) throw new LockedError()
      await db.update(prediction).set({ isJoker: false }).where(eq(prediction.id, current[0].id))
    }
  }

  await db.update(prediction).set({ isJoker: input.isJoker }).where(eq(prediction.id, preds[0].id))
}

// Combined totals of one match's predictions (for live pushes after a save).
export async function getMatchCrowdTotal(db: AppDatabase, matchId: string, opts?: { leagueId?: string }) {
  let query = db
    .select({
      home: sql<number>`coalesce(sum(${prediction.homeGoals}), 0)`.mapWith(Number),
      away: sql<number>`coalesce(sum(${prediction.awayGoals}), 0)`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(prediction)
    .$dynamic()
  if (opts?.leagueId) {
    query = query.innerJoin(
      leagueMember,
      and(eq(leagueMember.userId, prediction.userId), eq(leagueMember.leagueId, opts.leagueId)),
    )
  }
  const rows = await query.where(eq(prediction.matchId, matchId))
  return rows[0] ?? { home: 0, away: 0, count: 0 }
}

// Combined totals of everyone's predictions per match (1-1 + 2-1 + 4-0 = 7-2).
// League scope is display-only: the scoring crowd bonus always uses everyone.
export async function getCrowdTotals(db: AppDatabase, competitionId: string, opts?: { leagueId?: string }) {
  let query = db
    .select({
      matchId: prediction.matchId,
      home: sql<number>`sum(${prediction.homeGoals})`.mapWith(Number),
      away: sql<number>`sum(${prediction.awayGoals})`.mapWith(Number),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .$dynamic()
  if (opts?.leagueId) {
    query = query.innerJoin(
      leagueMember,
      and(eq(leagueMember.userId, prediction.userId), eq(leagueMember.leagueId, opts.leagueId)),
    )
  }
  const rows = await query.where(eq(match.competitionId, competitionId)).groupBy(prediction.matchId)
  return Object.fromEntries(rows.map((r) => [r.matchId, { home: r.home, away: r.away, count: r.count }]))
}

async function assertLeagueMembership(db: AppDatabase, leagueId: string, userId: string): Promise<void> {
  const [m] = await db
    .select({ userId: leagueMember.userId })
    .from(leagueMember)
    .where(and(eq(leagueMember.leagueId, leagueId), eq(leagueMember.userId, userId)))
    .limit(1)
  if (!m) throw new ForbiddenError('not a league member')
}

export interface UpsertLeaguePredictionInput {
  leagueId: string
  userId: string
  matchId: string
  home: number
  away: number
  isOutcomeOnly?: boolean
  wager?: number | null
}

// Write a league-specific override pick. The act of keeping a per-league pick
// switches that membership off sync (picksSynced=false) so the league stops
// mirroring the member's base pick. Same lock/teams rules as a base pick; no
// tamper-evidence commitment (the ledger covers the global base board only).
export async function upsertLeaguePrediction(
  db: AppDatabase,
  input: UpsertLeaguePredictionInput,
  now: Date = new Date(),
): Promise<string> {
  assertValidGoals(input.home, 'home goals')
  assertValidGoals(input.away, 'away goals')
  if (input.wager != null) assertValidWager(input.wager)

  const matchRow = await loadOpenMatch(db, input.matchId, now)
  await assertLeagueMembership(db, input.leagueId, input.userId)

  // Overrides only exist in moded leagues. A NORMAL league always mirrors the
  // base pick (its scoring carries the global crowd bonus + champion/best-scorer
  // that a per-league re-score can't reproduce - see TODO.md).
  const [lg] = await db.select({ mode: league.mode }).from(league).where(eq(league.id, input.leagueId)).limit(1)
  if (lg?.mode === 'NORMAL') throw new ValidationError('per-league picks are only available in easy, hard and hardcore leagues')

  return db.transaction(async (tx) => {
    if (input.wager != null && input.wager > 0) {
      // Budget across this league's own override stakes in the round. Stakes that
      // fall through to the base pick ride the base budget instead (see TODO.md
      // for full per-league effective-budget precision).
      const [{ other }] = await tx
        .select({ other: sql<number>`coalesce(sum(${leaguePrediction.wager}), 0)`.mapWith(Number) })
        .from(leaguePrediction)
        .where(
          and(
            eq(leaguePrediction.leagueId, input.leagueId),
            eq(leaguePrediction.userId, input.userId),
            eq(leaguePrediction.roundId, matchRow.roundId),
            ne(leaguePrediction.matchId, input.matchId),
          ),
        )
      await assertWagerWithinBudget(tx, matchRow.roundId, input.wager, other)
    }

    await tx
      .update(leagueMember)
      .set({ picksSynced: false })
      .where(and(eq(leagueMember.leagueId, input.leagueId), eq(leagueMember.userId, input.userId)))

    const [row] = await tx
      .insert(leaguePrediction)
      .values({
        leagueId: input.leagueId,
        userId: input.userId,
        matchId: input.matchId,
        roundId: matchRow.roundId,
        homeGoals: input.home,
        awayGoals: input.away,
        isOutcomeOnly: input.isOutcomeOnly ?? false,
        wager: input.wager ?? null,
      })
      .onConflictDoUpdate({
        target: [leaguePrediction.leagueId, leaguePrediction.userId, leaguePrediction.matchId],
        set: {
          homeGoals: input.home,
          awayGoals: input.away,
          ...(input.isOutcomeOnly !== undefined ? { isOutcomeOnly: input.isOutcomeOnly } : {}),
          ...(input.wager !== undefined ? { wager: input.wager } : {}),
        },
      })
      .returning({ id: leaguePrediction.id })
    return row.id
  })
}

export interface SetLeaguePicksSyncedInput {
  leagueId: string
  userId: string
  synced: boolean
}

// Toggle whether a league mirrors the member's base picks. Re-syncing drops the
// member's overrides on matches that have not kicked off; overrides on started
// matches stay, so a league's past scores are never rewritten.
export async function setLeaguePicksSynced(
  db: AppDatabase,
  input: SetLeaguePicksSyncedInput,
  now: Date = new Date(),
): Promise<void> {
  await assertLeagueMembership(db, input.leagueId, input.userId)
  await db.transaction(async (tx) => {
    await tx
      .update(leagueMember)
      .set({ picksSynced: input.synced })
      .where(and(eq(leagueMember.leagueId, input.leagueId), eq(leagueMember.userId, input.userId)))

    if (input.synced) {
      const openMatches = tx.select({ id: match.id }).from(match).where(gt(match.kickoffTime, now))
      await tx
        .delete(leaguePrediction)
        .where(
          and(
            eq(leaguePrediction.leagueId, input.leagueId),
            eq(leaguePrediction.userId, input.userId),
            inArray(leaguePrediction.matchId, openMatches),
          ),
        )
    }
  })
}

// A member's override picks in a league (for the per-league pick editor).
export async function getLeagueOverrides(db: AppDatabase, leagueId: string, userId: string) {
  return db
    .select({
      matchId: leaguePrediction.matchId,
      homeGoals: leaguePrediction.homeGoals,
      awayGoals: leaguePrediction.awayGoals,
      isOutcomeOnly: leaguePrediction.isOutcomeOnly,
      wager: leaguePrediction.wager,
      isJoker: leaguePrediction.isJoker,
    })
    .from(leaguePrediction)
    .where(and(eq(leaguePrediction.leagueId, leagueId), eq(leaguePrediction.userId, userId)))
}

export interface LeagueCompleteness {
  leagueId: string
  name: string
  mode: LeagueMode
  summary: CompletenessSummary
}

// Per-league completeness of the caller's picks for the matches still open to
// predict. Drives the "complete here, missing there" nudge: a NORMAL league
// flags outcome-only picks, a HARD league flags missing stakes. The effective
// pick is the league override when present, else the base pick.
export async function getLeagueCompleteness(
  db: AppDatabase,
  userId: string,
  competitionId: string,
  now: Date = new Date(),
): Promise<LeagueCompleteness[]> {
  const leagues = await db
    .select({ id: league.id, name: league.name, mode: league.mode })
    .from(leagueMember)
    .innerJoin(league, eq(league.id, leagueMember.leagueId))
    .where(and(eq(leagueMember.userId, userId), eq(league.competitionId, competitionId)))
  if (leagues.length === 0) return []

  const matches = await db
    .select({ id: match.id })
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        gt(match.kickoffTime, now),
        sql`${match.homeTeamCode} is not null`,
        sql`${match.awayTeamCode} is not null`,
      ),
    )
  const matchIds = matches.map((m) => m.id)
  if (matchIds.length === 0) {
    return leagues.map((l) => ({ leagueId: l.id, name: l.name, mode: l.mode, summary: summarizeCompleteness([]) }))
  }

  const basePicks = await db
    .select({ matchId: prediction.matchId, isOutcomeOnly: prediction.isOutcomeOnly, wager: prediction.wager })
    .from(prediction)
    .where(and(eq(prediction.userId, userId), inArray(prediction.matchId, matchIds)))
  const baseByMatch = new Map(basePicks.map((p) => [p.matchId, { isOutcomeOnly: p.isOutcomeOnly, wager: p.wager }]))

  const overrides = await db
    .select({
      leagueId: leaguePrediction.leagueId,
      matchId: leaguePrediction.matchId,
      isOutcomeOnly: leaguePrediction.isOutcomeOnly,
      wager: leaguePrediction.wager,
    })
    .from(leaguePrediction)
    .where(
      and(
        eq(leaguePrediction.userId, userId),
        inArray(leaguePrediction.matchId, matchIds),
        inArray(
          leaguePrediction.leagueId,
          leagues.map((l) => l.id),
        ),
      ),
    )
  const overrideByLeagueMatch = new Map(
    overrides.map((o) => [`${o.leagueId}:${o.matchId}`, { isOutcomeOnly: o.isOutcomeOnly, wager: o.wager }]),
  )

  return leagues.map((l) => {
    const statuses = matchIds.map((mid) => {
      const eff = overrideByLeagueMatch.get(`${l.id}:${mid}`) ?? baseByMatch.get(mid) ?? null
      return pickCompleteness(eff, l.mode)
    })
    return { leagueId: l.id, name: l.name, mode: l.mode, summary: summarizeCompleteness(statuses) }
  })
}
