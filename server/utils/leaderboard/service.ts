import { and, eq, isNotNull, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { bestScorerPick, championPick, leagueMember, match, prediction, user } from '../../../db/schema'

export interface LeaderboardRow {
  rank: number
  userId: string
  displayName: string
  image: string | null
  totalPoints: number
  predictionPoints: number
  championPoints: number
  championCode: string | null
  championName: string | null
  bestScorerPoints: number
  bestScorerName: string | null
  bestScorerCode: string | null
  livePoints: number
  exactCount: number
  outcomeCount: number
  gdCount: number
}

// Prediction aggregates are scoped to the competition via the match join.
const predPoints = sql<number>`coalesce(sum(${prediction.totalPoints}) filter (where ${match.id} is not null), 0)`
const exactCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} = 'EXACT')`
const outcomeCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} in ('EXACT', 'DIFF', 'OUTCOME'))`
const gdCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} in ('EXACT', 'DIFF'))`

export interface RankableRow {
  totalPoints: number
  exactCount: number
  outcomeCount: number
  gdCount: number
  userId: string
}

// Ranking ladder: points → exact → outcome → goal-diff. Players level on all four
// share a rank; userId only stabilises array order, it is not a tie-breaker.
export function compareLeaderboardRows(a: RankableRow, b: RankableRow): number {
  return (
    b.totalPoints - a.totalPoints ||
    b.exactCount - a.exactCount ||
    b.outcomeCount - a.outcomeCount ||
    b.gdCount - a.gdCount ||
    (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
  )
}

export async function getLeaderboard(
  db: AppDatabase,
  opts: {
    competitionId: string | null
    leagueId?: string
    limit?: number
    offset?: number
    includeHidden?: boolean
    // profilePrivate users opted out of public boards; league boards set this
    // when the viewer is a member of that league (or an admin).
    includePrivate?: boolean
    // Keep this user on the board even when hidden/private would exclude them
    // (so they see their own rank among the otherwise-visible population).
    alwaysIncludeUserId?: string
    // In-progress matches scored at their current scoreline, per user.
    liveProvisional?: Map<string, { points: number; exact: number; outcome: number; gd: number }>
  },
): Promise<LeaderboardRow[]> {
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0

  let query = db
    .select({
      userId: user.id,
      displayName: user.name,
      image: user.image,
      predictionPoints: predPoints.mapWith(Number),
      exactCount: exactCount.mapWith(Number),
      outcomeCount: outcomeCount.mapWith(Number),
      gdCount: gdCount.mapWith(Number),
    })
    .from(user)
    .$dynamic()
  // League view = same ranking over the member subset; ranks stay contiguous.
  if (opts.leagueId) {
    query = query.innerJoin(leagueMember, and(eq(leagueMember.userId, user.id), eq(leagueMember.leagueId, opts.leagueId)))
  }
  const base = await query
    .leftJoin(prediction, and(eq(prediction.userId, user.id), isNotNull(prediction.totalPoints)))
    .leftJoin(
      match,
      opts.competitionId
        ? and(eq(match.id, prediction.matchId), eq(match.competitionId, opts.competitionId))
        : eq(match.id, prediction.matchId),
    )
    // includeHidden serves self-stats: a hidden user still sees their own points.
    .where(
      opts.alwaysIncludeUserId
        ? or(
            eq(user.id, opts.alwaysIncludeUserId),
            and(
              ...(opts.includeHidden ? [] : [eq(user.hiddenFromLeaderboard, false)]),
              ...(opts.includePrivate ? [] : [eq(user.profilePrivate, false)]),
            ),
          )
        : and(
            ...(opts.includeHidden ? [] : [eq(user.hiddenFromLeaderboard, false)]),
            ...(opts.includePrivate ? [] : [eq(user.profilePrivate, false)]),
          ),
    )
    .groupBy(user.id, user.name, user.image)

  const champions = await db
    .select({ userId: championPick.userId, points: championPick.awardedPoints, teamCode: championPick.teamCode, teamName: championPick.teamName })
    .from(championPick)
    .where(opts.competitionId ? eq(championPick.competitionId, opts.competitionId) : undefined)
  // Sum across competitions for the global view (a user may have several picks).
  const championByUser = new Map<string, number>()
  const championCodeByUser = new Map<string, string | null>()
  const championNameByUser = new Map<string, string | null>()
  for (const c of champions) {
    championByUser.set(c.userId, (championByUser.get(c.userId) ?? 0) + c.points)
    // the flag only makes sense scoped to one competition
    if (opts.competitionId) {
      championCodeByUser.set(c.userId, c.teamCode)
      championNameByUser.set(c.userId, c.teamName)
    }
  }

  const bestScorers = await db
    .select({ userId: bestScorerPick.userId, points: bestScorerPick.awardedPoints, playerName: bestScorerPick.playerName, teamCode: bestScorerPick.teamCode })
    .from(bestScorerPick)
    .where(opts.competitionId ? eq(bestScorerPick.competitionId, opts.competitionId) : undefined)
  const bestScorerByUser = new Map<string, number>()
  const bestScorerNameByUser = new Map<string, string | null>()
  const bestScorerCodeByUser = new Map<string, string | null>()
  for (const b of bestScorers) {
    bestScorerByUser.set(b.userId, (bestScorerByUser.get(b.userId) ?? 0) + b.points)
    // the name/team only make sense scoped to one competition
    if (opts.competitionId) {
      bestScorerNameByUser.set(b.userId, b.playerName)
      bestScorerCodeByUser.set(b.userId, b.teamCode)
    }
  }

  // Bonus points are merged in JS (a SQL join would fan out the per-prediction
  // rows). totalPoints / exactCount / ... are the SCORED (confirmed) figures the
  // UI shows; livePoints is the provisional delta from in-progress matches shown
  // as "+N live". Ranking, though, is provisional: rows sort by scored + live so
  // the standings reflect what's happening on the pitch.
  const merged = base.map((r) => {
    const championPoints = championByUser.get(r.userId) ?? 0
    const bestScorerPoints = bestScorerByUser.get(r.userId) ?? 0
    const live = opts.liveProvisional?.get(r.userId)
    const totalPoints = r.predictionPoints + championPoints + bestScorerPoints
    const livePoints = live?.points ?? 0
    return {
      ...r,
      championPoints,
      championCode: championCodeByUser.get(r.userId) ?? null,
      championName: championNameByUser.get(r.userId) ?? null,
      bestScorerPoints,
      bestScorerName: bestScorerNameByUser.get(r.userId) ?? null,
      bestScorerCode: bestScorerCodeByUser.get(r.userId) ?? null,
      livePoints,
      totalPoints, // scored only - the live delta is added for ranking, not display
      rankTotal: totalPoints + livePoints,
      rankExact: r.exactCount + (live?.exact ?? 0),
      rankOutcome: r.outcomeCount + (live?.outcome ?? 0),
      rankGd: r.gdCount + (live?.gd ?? 0),
      rank: 0,
    }
  })

  // Same ladder as compareLeaderboardRows, but over the provisional (scored +
  // live) figures so in-progress points move players up. Players level on the
  // whole ladder share a rank; userId only stabilises array order.
  merged.sort((a, b) =>
    compareLeaderboardRows(
      { totalPoints: a.rankTotal, exactCount: a.rankExact, outcomeCount: a.rankOutcome, gdCount: a.rankGd, userId: a.userId },
      { totalPoints: b.rankTotal, exactCount: b.rankExact, outcomeCount: b.rankOutcome, gdCount: b.rankGd, userId: b.userId },
    ),
  )

  // Standard competition ranking ("1224"): equal-on-the-ladder rows share a rank,
  // the next distinct row skips ahead. Computed over the full board before paging.
  let rank = 0
  let prevKey: string | null = null
  merged.forEach((r, i) => {
    const key = `${r.rankTotal}|${r.rankExact}|${r.rankOutcome}|${r.rankGd}`
    if (key !== prevKey) {
      rank = i + 1
      prevKey = key
    }
    r.rank = rank
  })

  return merged.slice(offset, offset + limit).map((r) => ({
    rank: r.rank,
    userId: r.userId,
    displayName: r.displayName,
    image: r.image,
    totalPoints: r.totalPoints,
    predictionPoints: r.predictionPoints,
    championPoints: r.championPoints,
    championCode: r.championCode,
    championName: r.championName,
    bestScorerPoints: r.bestScorerPoints,
    bestScorerName: r.bestScorerName,
    bestScorerCode: r.bestScorerCode,
    livePoints: r.livePoints,
    exactCount: r.exactCount,
    outcomeCount: r.outcomeCount,
    gdCount: r.gdCount,
  }))
}
