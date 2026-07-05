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
//
// One ranking function `rankRows` is the single source of truth for how a criterion
// orders its members: the standings winners are its rank-1 rows and the ranking
// dialog is its whole ladder, so the card and the dialog can never disagree.

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

// One criterion's full dense (1224) ranking over an already-fetched member subset.
// Points criteria rank on the full points -> exact -> outcome -> goal-diff ladder;
// count criteria rank on their metric (ties fall back to the ladder). WOODEN_SPOON
// inverts (lowest first) and keeps zeros - a zero is a real last place among members
// who predicted. Every other criterion drops zero-value rows (they did not score in
// it). rankRows is pure so the batch standings path and the single-criterion ranking
// path share it without sharing a query.
function rankRows(type: LeagueRewardCriterion, rows: RankableRow[]): RankedRewardRow[] {
  if (rows.length === 0) return []
  if (type === 'WOODEN_SPOON') {
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

// The winner(s) of a ranked criterion: its rank-1 rows. TEAM_SPECIALIST is the
// exception - every predictor with an exact on the featured team holds it (valued by
// their own count), so the whole ranking is holders, not just the top tie.
function holdersOf(type: LeagueRewardCriterion, ranked: RankedRewardRow[]): RankedRewardRow[] {
  return type === 'TEAM_SPECIALIST' ? ranked : ranked.filter((r) => r.rank === 1)
}

function teamFilter(teamCode: string): SQL {
  return or(eq(match.homeTeamCode, teamCode), eq(match.awayTeamCode, teamCode))!
}

// The match subset a single criterion scores over. GROUP = the group stage, KNOCKOUT
// = the rest, FINAL = the final only, TEAM = the league's featured-team fixtures.
// undefined = the whole competition.
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
// competition end). OVERALL comes off the league leaderboard; the rest are the rank-1
// rows of each criterion's ranking (TEAM_SPECIALIST: every exact holder). Omitted
// without a featured team.
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
    for (const h of holdersOf(type, rankRows(type, subsetFor(type, subsets)))) {
      out.push({ type, userId: h.userId, value: h.value })
    }
  }
  return out
}

// One criterion's full live ranking among a league's members. The rank-1 rows are the
// current leaders (WOODEN_SPOON inverts: rank 1 is the lowest score). Shares rankRows
// with the winners computation, so a member's card position and the ranking dialog
// always agree.
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
  return rankRows(type, rows)
}
