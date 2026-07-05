import { and, eq, inArray, isNotNull, ne, type SQL, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competitionAward, match, prediction } from '../../../db/schema'
import { compareLeaderboardRows, getLeaderboard, type RankableRow } from '../leaderboard/service'
import type { CompetitionAwardType } from '#shared/types/achievements'

// The competition-end trophies (the "prizes" of the contest). Each is derived at
// finalize from the settled prediction/leaderboard state, so recomputing is safe
// and idempotent. Ties share a trophy: several users can hold the same type.
// The featured-team TEAM_SPECIALIST trophy is no longer minted (the featured team
// moved to a per-league prize); the union keeps the value for historical rows.
export interface TrophyAward {
  type: CompetitionAwardType
  userId: string
  // The winning metric shown on the trophy: points for OVERALL/phase trophies,
  // EXACT count for MADAME_IRMA. teamCode is unused by current trophies (kept for
  // the historical TEAM_SPECIALIST rows).
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

// The match subset each criterion scores over. GROUP = the group stage, KNOCKOUT
// = everything after it. OVERALL/MADAME_IRMA span the whole competition (no filter)
// and TEAM_SPECIALIST is team-scoped by the caller (it needs the team code).
export function criteriaMatchFilter(type: CompetitionAwardType): SQL | undefined {
  switch (type) {
    case 'GROUP_PHASE':
      return eq(match.stage, 'GROUP')
    case 'KNOCKOUT_PHASE':
      return ne(match.stage, 'GROUP')
    default:
      return undefined
  }
}

// Per-user rankable aggregates over the competition's predictions, optionally
// narrowed to a subset of matches (a phase, or a team's fixtures) and to a subset
// of users (a league's members). Only scored predictions count; a user with no
// scored pick in the subset is absent. Exported for the league-reward criteria
// engine (server/utils/rewards/criteria.ts), which ranks the same aggregates over
// a wider set of metric x filter combinations.
export async function rankableForMatches(
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

// The global competition-end trophy winners from the CURRENT settled state (no
// league scope). The featured-team TEAM_SPECIALIST trophy is no longer minted (the
// featured team is now a per-league prize; see server/utils/rewards/criteria.ts).
// No final gate here: computeTrophies applies it. League prize winners are computed
// separately by the reward criteria engine, over a wider criteria set.
export async function computeCriteriaWinners(db: AppDatabase, competitionId: string): Promise<TrophyAward[]> {
  const out: TrophyAward[] = []

  // OVERALL = the leaderboard winner (folds in champion + best-scorer bonuses).
  const board = await getLeaderboard(db, {
    competitionId,
    includeHidden: true,
    includePrivate: true,
    limit: 100_000,
  })
  const overall = board.filter((r) => r.rank === 1 && r.totalPoints > 0)
  for (const r of overall) out.push({ type: 'OVERALL', userId: r.userId, value: r.totalPoints, teamCode: null })

  // Phase trophies are pure prediction points within the phase (no meta bonus,
  // which isn't phase-attributable). GROUP = the group stage, KNOCKOUT = the rest.
  pushPointsWinners(out, 'GROUP_PHASE', await rankableForMatches(db, competitionId, criteriaMatchFilter('GROUP_PHASE')))
  pushPointsWinners(out, 'KNOCKOUT_PHASE', await rankableForMatches(db, competitionId, criteriaMatchFilter('KNOCKOUT_PHASE')))

  // Madame IRMA = the most EXACT scorelines across the whole competition.
  const whole = await rankableForMatches(db, competitionId)
  const maxExact = Math.max(0, ...whole.map((r) => r.exactCount))
  if (maxExact > 0) {
    for (const r of whole.filter((r) => r.exactCount === maxExact)) {
      out.push({ type: 'MADAME_IRMA', userId: r.userId, value: r.exactCount, teamCode: null })
    }
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
