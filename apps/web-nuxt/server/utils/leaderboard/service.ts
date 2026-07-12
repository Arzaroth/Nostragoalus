import { and, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import {
  bestScorerPick,
  championPick,
  leagueMember,
  match,
  prediction,
  showcasePin,
  user,
  userAchievement,
} from '../../../db/schema'
import type { ShowcaseIconDto } from '#shared/types/achievements'
import { ALL_ACHIEVEMENTS } from '../achievements/catalog'

// Showcased achievements store only the key; the icon needs the category. Resolve
// it once from the code catalog so the board never round-trips per row.
const CATEGORY_BY_KEY = new Map(ALL_ACHIEVEMENTS.map((a) => [a.key, a.category]))

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
  // Up to three achievements the user pinned to their showcase (icon + tint).
  showcase: ShowcaseIconDto[]
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

// Standard competition ("1224") ranking over rows already sorted by the ladder:
// equal-key rows share a rank, the next distinct key skips ahead. Takes the
// per-row tie key in sorted order and returns the rank for each position.
export function denseRanks(sortedKeys: string[]): number[] {
  const out: number[] = []
  let rank = 0
  let prev: string | null = null
  sortedKeys.forEach((key, i) => {
    if (key !== prev) {
      rank = i + 1
      prev = key
    }
    out.push(rank)
  })
  return out
}

// How many league members the board leaves out for visibility reasons (mirrors
// getLeaderboard's WHERE): admin-hidden always, private profiles when the
// viewer isn't entitled to see them. The viewer themselves is never counted
// (they're always shown via alwaysIncludeUserId), so "+N hidden" never includes
// "you".
export async function countLeagueMembersHiddenFromBoard(
  db: AppDatabase,
  opts: { leagueId: string; includePrivate?: boolean; viewerId?: string },
): Promise<number> {
  const visibilityExcluded = or(
    eq(user.hiddenFromLeaderboard, true),
    ...(opts.includePrivate ? [] : [eq(user.profilePrivate, true)]),
  )
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leagueMember)
    .innerJoin(user, eq(user.id, leagueMember.userId))
    .where(
      and(
        eq(leagueMember.leagueId, opts.leagueId),
        visibilityExcluded,
        ...(opts.viewerId ? [ne(user.id, opts.viewerId)] : []),
      ),
    )
  return row?.n ?? 0
}

// Fold a competition's meta-pick rows (champion or best scorer) into the per-user
// maps the leaderboard merge needs: points summed across competitions (for the
// global view, where a user may have several picks), and the code/name kept only
// when scoped to a single competition (a single pick's identity is meaningless
// summed across competitions).
function collectMetaBonus(
  rows: { userId: string; points: number; code: string | null; name: string | null }[],
  scopedToCompetition: boolean,
): { points: Map<string, number>; code: Map<string, string | null>; name: Map<string, string | null> } {
  const points = new Map<string, number>()
  const code = new Map<string, string | null>()
  const name = new Map<string, string | null>()
  for (const r of rows) {
    points.set(r.userId, (points.get(r.userId) ?? 0) + r.points)
    if (scopedToCompetition) {
      code.set(r.userId, r.code)
      name.set(r.userId, r.name)
    }
  }
  return { points, code, name }
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

  // Champion and best-scorer bonuses fold identically (sum points; keep one
  // pick's code/name only when competition-scoped) - the only difference is the
  // table and which column is the display "name" (team vs player).
  const championBonus = collectMetaBonus(
    await db
      .select({ userId: championPick.userId, points: championPick.awardedPoints, code: championPick.teamCode, name: championPick.teamName })
      .from(championPick)
      .where(opts.competitionId ? eq(championPick.competitionId, opts.competitionId) : undefined),
    !!opts.competitionId,
  )
  const bestScorerBonus = collectMetaBonus(
    await db
      .select({ userId: bestScorerPick.userId, points: bestScorerPick.awardedPoints, code: bestScorerPick.teamCode, name: bestScorerPick.playerName })
      .from(bestScorerPick)
      .where(opts.competitionId ? eq(bestScorerPick.competitionId, opts.competitionId) : undefined),
    !!opts.competitionId,
  )

  // Up to three showcased achievements per user, icon-ready {key, category, tier}.
  // Competition/league scope only (showcase_pin.competitionId is notNull); the
  // tier join tolerates a global badge (null competitionId) sharing the key.
  const showcaseByUser = new Map<string, ShowcaseIconDto[]>()
  if (opts.competitionId) {
    const pins = await db
      .select({ userId: showcasePin.userId, key: showcasePin.achievementKey, tier: userAchievement.tier })
      .from(showcasePin)
      .leftJoin(
        userAchievement,
        and(
          eq(userAchievement.userId, showcasePin.userId),
          eq(userAchievement.key, showcasePin.achievementKey),
          or(eq(userAchievement.competitionId, opts.competitionId), isNull(userAchievement.competitionId)),
        ),
      )
      .where(eq(showcasePin.competitionId, opts.competitionId))
      .orderBy(showcasePin.slot)
    for (const p of pins) {
      // Skip a pin whose achievement was retired from the catalog since it was
      // set - its icon category can't be resolved, so it can't be rendered.
      const category = CATEGORY_BY_KEY.get(p.key)
      if (!category) continue
      const arr = showcaseByUser.get(p.userId) ?? []
      arr.push({ key: p.key, category, tier: p.tier })
      showcaseByUser.set(p.userId, arr)
    }
  }

  // Bonus points are merged in JS (a SQL join would fan out the per-prediction
  // rows). totalPoints / exactCount / ... are the SCORED (confirmed) figures the
  // UI shows; livePoints is the provisional delta from in-progress matches shown
  // as "+N live". Ranking, though, is provisional: rows sort by scored + live so
  // the standings reflect what's happening on the pitch.
  const merged = base.map((r) => {
    const championPoints = championBonus.points.get(r.userId) ?? 0
    const bestScorerPoints = bestScorerBonus.points.get(r.userId) ?? 0
    const live = opts.liveProvisional?.get(r.userId)
    const totalPoints = r.predictionPoints + championPoints + bestScorerPoints
    const livePoints = live?.points ?? 0
    return {
      ...r,
      championPoints,
      championCode: championBonus.code.get(r.userId) ?? null,
      championName: championBonus.name.get(r.userId) ?? null,
      bestScorerPoints,
      bestScorerName: bestScorerBonus.name.get(r.userId) ?? null,
      bestScorerCode: bestScorerBonus.code.get(r.userId) ?? null,
      showcase: showcaseByUser.get(r.userId) ?? [],
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
  const ranks = denseRanks(merged.map((r) => `${r.rankTotal}|${r.rankExact}|${r.rankOutcome}|${r.rankGd}`))
  merged.forEach((r, i) => {
    r.rank = ranks[i]
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
    showcase: r.showcase,
  }))
}
