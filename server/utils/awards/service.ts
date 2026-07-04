import { and, eq, inArray, isNotNull, ne, or, type SQL, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition, competitionAward, match, prediction } from '../../../db/schema'
import { compareLeaderboardRows, getLeaderboard, type RankableRow } from '../leaderboard/service'
import type { CompetitionAwardType } from '#shared/types/achievements'

// The competition-end trophies (the "prizes" of the contest). Each is derived at
// finalize from the settled prediction/leaderboard state, so recomputing is safe
// and idempotent. Ties share a trophy: several users can hold the same type.
export interface TrophyAward {
  type: CompetitionAwardType
  userId: string
  // The winning metric shown on the trophy: points for OVERALL/phase trophies,
  // EXACT count for MADAME_IRMA. teamCode is set only for TEAM_SPECIALIST.
  value: number
  teamCode: string | null
}

// Two rows tie on the leaderboard ladder when they match on all four metrics.
// compareLeaderboardRows falls back to userId, so it can never report a tie
// between two distinct users - this is the userId-blind version for "who won".
function sameLadder(a: RankableRow, b: RankableRow): boolean {
  return (
    a.totalPoints === b.totalPoints &&
    a.exactCount === b.exactCount &&
    a.outcomeCount === b.outcomeCount &&
    a.gdCount === b.gdCount
  )
}

// The winners of a ranked subset: every row level with the best on the full
// points -> exact -> outcome -> goal-diff ladder.
function topTiedByLadder(rows: RankableRow[]): RankableRow[] {
  if (rows.length === 0) return []
  const best = [...rows].sort(compareLeaderboardRows)[0]
  return rows.filter((r) => sameLadder(r, best))
}

// Per-user rankable aggregates over the competition's predictions, optionally
// narrowed to a subset of matches (a phase, or a team's fixtures) and to a subset
// of users (a league's members). Only scored predictions count; a user with no
// scored pick in the subset is absent.
async function rankableForMatches(
  db: AppDatabase,
  competitionId: string,
  matchFilter?: SQL,
  userIds?: string[],
): Promise<RankableRow[]> {
  return db
    .select({
      userId: prediction.userId,
      totalPoints: sql<number>`coalesce(sum(${prediction.totalPoints}), 0)`.mapWith(Number),
      exactCount: sql<number>`count(*) filter (where ${prediction.baseTier} = 'EXACT')`.mapWith(Number),
      outcomeCount: sql<number>`count(*) filter (where ${prediction.baseTier} in ('EXACT', 'DIFF', 'OUTCOME'))`.mapWith(
        Number,
      ),
      gdCount: sql<number>`count(*) filter (where ${prediction.baseTier} in ('EXACT', 'DIFF'))`.mapWith(Number),
    })
    .from(prediction)
    .innerJoin(match, and(eq(match.id, prediction.matchId), eq(match.competitionId, competitionId), matchFilter))
    .where(and(isNotNull(prediction.totalPoints), userIds ? inArray(prediction.userId, userIds) : undefined))
    .groupBy(prediction.userId)
}

// A competition's trophies are only decided once its final is played out. Mirrors
// the champion/best-scorer gate (a decided FINAL with a HOME/AWAY winner).
export async function hasDecidedFinal(db: AppDatabase, competitionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: match.id })
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        eq(match.stage, 'FINAL'),
        eq(match.status, 'FINISHED'),
        inArray(match.winner, ['HOME', 'AWAY']),
      ),
    )
    .limit(1)
  return rows.length > 0
}

// Tournament Wrapped needs a stricter gate than hasDecidedFinal: the final must
// also be SCORED, i.e. finalize has run. The winner is written by match sync,
// but the final round's prediction scoring, the champion/best-scorer bonuses and
// the trophy rows only land when finalize marks the final scoringState='SCORED'
// (in that same transaction). Gating on the winner alone would unlock the recap
// in the sync -> finalize window with unscored predictions, zeroed meta bonuses
// and an empty trophy haul, while presenting itself as the definitive recap.
export async function hasScoredFinal(db: AppDatabase, competitionId: string): Promise<boolean> {
  const rows = await db
    .select({ id: match.id })
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        eq(match.stage, 'FINAL'),
        eq(match.status, 'FINISHED'),
        inArray(match.winner, ['HOME', 'AWAY']),
        eq(match.scoringState, 'SCORED'),
      ),
    )
    .limit(1)
  return rows.length > 0
}

function pushPointsWinners(
  out: TrophyAward[],
  type: CompetitionAwardType,
  rows: RankableRow[],
  teamCode: string | null = null,
): void {
  const winners = topTiedByLadder(rows)
  // Skip a degenerate all-zero board (e.g. a phase not yet played): a trophy
  // means someone actually scored in it.
  if (winners.length === 0 || winners[0].totalPoints <= 0) return
  for (const r of winners) out.push({ type, userId: r.userId, value: r.totalPoints, teamCode })
}

// The five-criteria winners from the CURRENT settled state, optionally scoped to a
// league (OVERALL via the league board, the rest via its members). No final gate:
// shared by the (final-gated, global) trophy award and the (live, provisional)
// league rewards, so a league sees "who is currently winning each prize".
export async function computeCriteriaWinners(
  db: AppDatabase,
  competitionId: string,
  opts: { leagueId?: string; memberIds?: string[] } = {},
): Promise<TrophyAward[]> {
  const out: TrophyAward[] = []
  const ids = opts.memberIds

  // OVERALL = the leaderboard winner (folds in champion + best-scorer bonuses).
  // Scoped to the league's member subset when a leagueId is given.
  const board = await getLeaderboard(db, {
    competitionId,
    leagueId: opts.leagueId,
    includeHidden: true,
    includePrivate: true,
    limit: 100_000,
  })
  const overall = board.filter((r) => r.rank === 1 && r.totalPoints > 0)
  for (const r of overall) out.push({ type: 'OVERALL', userId: r.userId, value: r.totalPoints, teamCode: null })

  // Phase trophies are pure prediction points within the phase (no meta bonus,
  // which isn't phase-attributable). GROUP = the group stage, KNOCKOUT = the rest.
  pushPointsWinners(out, 'GROUP_PHASE', await rankableForMatches(db, competitionId, eq(match.stage, 'GROUP'), ids))
  pushPointsWinners(out, 'KNOCKOUT_PHASE', await rankableForMatches(db, competitionId, ne(match.stage, 'GROUP'), ids))

  // Madame IRMA = the most EXACT scorelines across the whole competition.
  const whole = await rankableForMatches(db, competitionId, undefined, ids)
  const maxExact = Math.max(0, ...whole.map((r) => r.exactCount))
  if (maxExact > 0) {
    for (const r of whole.filter((r) => r.exactCount === maxExact)) {
      out.push({ type: 'MADAME_IRMA', userId: r.userId, value: r.exactCount, teamCode: null })
    }
  }

  // Team specialist = best predictor of the competition's featured team, when one
  // is configured (default the host). Names the team on the trophy.
  const [comp] = await db
    .select({ code: competition.featuredTeamCode })
    .from(competition)
    .where(eq(competition.id, competitionId))
    .limit(1)
  if (comp?.code) {
    const rows = await rankableForMatches(
      db,
      competitionId,
      or(eq(match.homeTeamCode, comp.code), eq(match.awayTeamCode, comp.code)),
      ids,
    )
    pushPointsWinners(out, 'TEAM_SPECIALIST', rows, comp.code)
  }

  return out
}

// Global trophy holders for a finished competition. Empty until the final is
// decided (and empty again if it somehow un-decides), which drives the reset.
async function computeTrophies(db: AppDatabase, competitionId: string): Promise<TrophyAward[]> {
  if (!(await hasDecidedFinal(db, competitionId))) return []
  return computeCriteriaWinners(db, competitionId)
}

// Idempotent: reconcile competition_award to the freshly computed set. Stale
// rows are removed, changed values updated, and genuinely new trophies inserted.
// Reconciling (rather than delete-all + reinsert) keeps awardedAt stable and lets
// the caller notify only the newly-awarded rows. Safe on every finalize tick.
export async function awardCompetitionTrophies(db: AppDatabase, competitionId: string): Promise<TrophyAward[]> {
  const desired = await computeTrophies(db, competitionId)
  const existing = await db.select().from(competitionAward).where(eq(competitionAward.competitionId, competitionId))

  const key = (a: { type: string; userId: string }) => `${a.type}:${a.userId}`
  const desiredByKey = new Map(desired.map((d) => [key(d), d]))
  const existingByKey = new Map(existing.map((e) => [key(e), e]))

  const staleIds = existing.filter((e) => !desiredByKey.has(key(e))).map((e) => e.id)
  if (staleIds.length > 0) await db.delete(competitionAward).where(inArray(competitionAward.id, staleIds))

  const newlyAwarded: TrophyAward[] = []
  for (const d of desired) {
    const ex = existingByKey.get(key(d))
    if (!ex) {
      await db.insert(competitionAward).values({
        competitionId,
        userId: d.userId,
        type: d.type,
        value: d.value,
        teamCode: d.teamCode,
      })
      newlyAwarded.push(d)
    } else if (ex.value !== d.value || ex.teamCode !== d.teamCode) {
      await db.update(competitionAward).set({ value: d.value, teamCode: d.teamCode }).where(eq(competitionAward.id, ex.id))
    }
  }

  return newlyAwarded
}
