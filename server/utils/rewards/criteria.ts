import { eq, ne, or, type SQL } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'
import { compareLeaderboardRows, denseRanks, getLeaderboard, type RankableRow } from '../leaderboard/service'
import { rankableForMatches } from '../awards/service'
import { LEAGUE_REWARD_CRITERIA, type LeagueRewardCriterion, type RewardMetric, rewardMetricFor } from '#shared/types/rewards'

// The live league-prize engine. Where the global trophies (server/utils/awards)
// cover a fixed five, a league can attach a prize to any of LEAGUE_REWARD_CRITERIA.
// Each criterion is a (metric x match-filter x direction) over the same per-user
// aggregates the trophies use (rankableForMatches), plus OVERALL off the league
// leaderboard (which folds in the champion/best-scorer bonuses). Winners are
// derived live among the league's members; nothing is stored.

export interface RewardWinner {
  type: LeagueRewardCriterion
  userId: string
  value: number
}

export interface RankedRewardRow {
  userId: string
  value: number
  rank: number
}

export interface LeagueCriteriaOpts {
  leagueId: string
  memberIds: string[]
  // The league's featured team (TEAM_SPECIALIST only). Null disables that criterion.
  featuredTeamCode: string | null
}

function metricValue(r: RankableRow, metric: RewardMetric): number {
  switch (metric) {
    case 'points':
      return r.totalPoints
    case 'exact':
      return r.exactCount
    case 'outcome':
      return r.outcomeCount
    case 'goaldiff':
      return r.gdCount
  }
}

// Two rows are level on the full points -> exact -> outcome -> goal-diff ladder.
function sameLadder(a: RankableRow, b: RankableRow): boolean {
  return (
    a.totalPoints === b.totalPoints &&
    a.exactCount === b.exactCount &&
    a.outcomeCount === b.outcomeCount &&
    a.gdCount === b.gdCount
  )
}

// The winner(s) of a rankable criterion (everything but OVERALL). Points criteria
// take the top-tied ladder rows (a positive score required). Count criteria take
// the rows at the max value. WOODEN_SPOON inverts: the lowest score(s). And
// TEAM_SPECIALIST is multi-winner: every predictor with an exact on the featured
// team holds it, valued by their exact count.
function winnersFromRankable(type: LeagueRewardCriterion, rows: RankableRow[]): Array<{ userId: string; value: number }> {
  if (rows.length === 0) return []
  const metric = rewardMetricFor(type)
  if (type === 'WOODEN_SPOON') {
    const min = Math.min(...rows.map((r) => r.totalPoints))
    return rows.filter((r) => r.totalPoints === min).map((r) => ({ userId: r.userId, value: r.totalPoints }))
  }
  if (type === 'TEAM_SPECIALIST') {
    return rows.filter((r) => r.exactCount > 0).map((r) => ({ userId: r.userId, value: r.exactCount }))
  }
  if (metric === 'points') {
    const best = [...rows].sort(compareLeaderboardRows)[0]
    if (best.totalPoints <= 0) return []
    return rows.filter((r) => sameLadder(r, best)).map((r) => ({ userId: r.userId, value: r.totalPoints }))
  }
  const max = Math.max(0, ...rows.map((r) => metricValue(r, metric)))
  if (max <= 0) return []
  return rows.filter((r) => metricValue(r, metric) === max).map((r) => ({ userId: r.userId, value: max }))
}

// The per-user aggregates a whole standings pass needs, grouped by their distinct
// match subset so we run one query per subset (whole/group/knockout/final/team)
// rather than one per criterion. TEAM_SPECIALIST's subset is skipped without a team.
async function rankableSubsets(
  db: AppDatabase,
  competitionId: string,
  opts: LeagueCriteriaOpts,
): Promise<Record<'whole' | 'group' | 'knockout' | 'final' | 'team', RankableRow[]>> {
  const ids = opts.memberIds
  const [whole, group, knockout, final, team] = await Promise.all([
    rankableForMatches(db, competitionId, undefined, ids),
    rankableForMatches(db, competitionId, eq(match.stage, 'GROUP'), ids),
    rankableForMatches(db, competitionId, ne(match.stage, 'GROUP'), ids),
    rankableForMatches(db, competitionId, eq(match.stage, 'FINAL'), ids),
    opts.featuredTeamCode ? rankableForMatches(db, competitionId, teamFilter(opts.featuredTeamCode), ids) : Promise.resolve([]),
  ])
  return { whole, group, knockout, final, team }
}

function teamFilter(teamCode: string): SQL {
  return or(eq(match.homeTeamCode, teamCode), eq(match.awayTeamCode, teamCode))!
}

// The match subset a single criterion scores over, for the on-demand ranking. GROUP
// = the group stage, KNOCKOUT = the rest, FINAL = the final only, TEAM = the league's
// featured-team fixtures. undefined = the whole competition.
function criterionFilter(type: LeagueRewardCriterion, teamCode: string | null): SQL | undefined {
  switch (type) {
    case 'GROUP_PHASE':
    case 'GROUP_ORACLE':
      return eq(match.stage, 'GROUP')
    case 'KNOCKOUT_PHASE':
    case 'KNOCKOUT_ORACLE':
      return ne(match.stage, 'GROUP')
    case 'FINALIST':
      return eq(match.stage, 'FINAL')
    case 'TEAM_SPECIALIST':
      return teamCode ? teamFilter(teamCode) : undefined
    default:
      return undefined
  }
}

function subsetFor(
  type: LeagueRewardCriterion,
  s: Record<'whole' | 'group' | 'knockout' | 'final' | 'team', RankableRow[]>,
): RankableRow[] {
  switch (type) {
    case 'GROUP_PHASE':
    case 'GROUP_ORACLE':
      return s.group
    case 'KNOCKOUT_PHASE':
    case 'KNOCKOUT_ORACLE':
      return s.knockout
    case 'FINALIST':
      return s.final
    case 'TEAM_SPECIALIST':
      return s.team
    default:
      return s.whole
  }
}

// Every criterion's current league winner(s), live/provisional (settles at
// competition end). OVERALL comes off the league leaderboard; the rest off the
// rankable subsets. TEAM_SPECIALIST is omitted without a featured team.
export async function computeLeagueRewardWinners(
  db: AppDatabase,
  competitionId: string,
  opts: LeagueCriteriaOpts,
): Promise<RewardWinner[]> {
  const out: RewardWinner[] = []

  const board = await getLeaderboard(db, {
    competitionId,
    leagueId: opts.leagueId,
    includeHidden: true,
    includePrivate: true,
    limit: 100_000,
  })
  for (const r of board.filter((r) => r.rank === 1 && r.totalPoints > 0)) {
    out.push({ type: 'OVERALL', userId: r.userId, value: r.totalPoints })
  }

  const subsets = await rankableSubsets(db, competitionId, opts)
  for (const type of LEAGUE_REWARD_CRITERIA) {
    if (type === 'OVERALL') continue
    if (type === 'TEAM_SPECIALIST' && !opts.featuredTeamCode) continue
    for (const w of winnersFromRankable(type, subsetFor(type, subsets))) {
      out.push({ type, userId: w.userId, value: w.value })
    }
  }
  return out
}

// One criterion's full live ranking among a league's members. The rank-1 rows are
// the current leaders (WOODEN_SPOON inverts: rank 1 is the lowest score). Only rows
// that scored in the criterion (value > 0) are returned, except WOODEN_SPOON where a
// zero is a legitimate last place among members who did predict.
export async function rankLeagueCriterion(
  db: AppDatabase,
  competitionId: string,
  type: LeagueRewardCriterion,
  opts: LeagueCriteriaOpts,
): Promise<RankedRewardRow[]> {
  if (type === 'OVERALL') {
    const board = await getLeaderboard(db, {
      competitionId,
      leagueId: opts.leagueId,
      includeHidden: true,
      includePrivate: true,
      limit: 100_000,
    })
    return board.filter((r) => r.totalPoints > 0).map((r) => ({ userId: r.userId, value: r.totalPoints, rank: r.rank }))
  }

  if (type === 'TEAM_SPECIALIST' && !opts.featuredTeamCode) return []
  const rows = await rankableForMatches(db, competitionId, criterionFilter(type, opts.featuredTeamCode), opts.memberIds)

  if (type === 'WOODEN_SPOON') {
    // Ascending: the fewest points ranks first. Ties (same points) share a rank; a
    // zero stays in (it is a real last place among members who predicted).
    const sorted = [...rows].sort((a, b) => a.totalPoints - b.totalPoints || compareLeaderboardRows(a, b))
    const ranks = denseRanks(sorted.map((r) => `${r.totalPoints}`))
    return sorted.map((r, i) => ({ userId: r.userId, value: r.totalPoints, rank: ranks[i] }))
  }

  const metric = rewardMetricFor(type)
  const byLadder = metric === 'points'
  const sorted = [...rows].sort(byLadder ? compareLeaderboardRows : (a, b) => metricValue(b, metric) - metricValue(a, metric) || compareLeaderboardRows(a, b))
  const ranks = denseRanks(
    sorted.map((r) => (byLadder ? `${r.totalPoints}|${r.exactCount}|${r.outcomeCount}|${r.gdCount}` : `${metricValue(r, metric)}`)),
  )
  const out = sorted.map((r, i) => ({ userId: r.userId, value: byLadder ? r.totalPoints : metricValue(r, metric), rank: ranks[i] }))
  return out.filter((r) => r.value > 0)
}
