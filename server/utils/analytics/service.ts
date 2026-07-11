import { and, asc, eq, isNotNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition as competitionTable, goalEvent, match, prediction, round } from '../../../db/schema'
import { NotFoundError } from '../errors'
import { basePointsFor, classifyTier, DEFAULT_BASE_POINTS, outcomeOf, type BasePoints, type Outcome } from '../scoring/tiers'
import { getScoringConfigFor } from '../scoring/store'
import type {
  AnalyticsResponse,
  FergieSwing,
  FergieTime,
  PickHighlight,
  RoundAccuracy,
  TeamBias,
  TierCounts,
} from '#shared/types/analytics'

// One scored pick joined to its match result and round, the raw material the
// pure aggregation below turns into the bias report.
export interface AnalyticsPickRow {
  homeGoals: number
  awayGoals: number
  baseTier: 'EXACT' | 'DIFF' | 'OUTCOME' | 'MISS' | null
  totalPoints: number
  isJoker: boolean
  actualHome: number
  actualAway: number
  homeTeam: string
  awayTeam: string
  homeCode: string | null
  awayCode: string | null
  roundLabel: string
  roundOrder: number
  // Added-time goals scored for each side in this match, counted only when the
  // match's recorded goals reconcile with its full-time score (0 otherwise).
  stoppageHome: number
  stoppageAway: number
}

const MIN_TEAM_SAMPLE = 2
const TOP_TEAMS = 3
// Highest-value tier first, for the best-call tie-break.
const TIER_RANK: Record<'EXACT' | 'DIFF' | 'OUTCOME' | 'MISS', number> = {
  EXACT: 3,
  DIFF: 2,
  OUTCOME: 1,
  MISS: 0,
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// A legacy scored row can carry a null tier; the leaderboard treats that as a
// miss, so mirror that here.
function tierOf(row: AnalyticsPickRow): keyof TierCounts {
  switch (row.baseTier) {
    case 'EXACT':
      return 'exact'
    case 'DIFF':
      return 'diff'
    case 'OUTCOME':
      return 'outcome'
    default:
      return 'miss'
  }
}

function highlight(row: AnalyticsPickRow): PickHighlight {
  return {
    home: row.homeTeam,
    away: row.awayTeam,
    homeCode: row.homeCode,
    awayCode: row.awayCode,
    predicted: `${row.homeGoals}-${row.awayGoals}`,
    actual: `${row.actualHome}-${row.actualAway}`,
    points: row.totalPoints,
    tier: tierOf(row),
    isJoker: row.isJoker,
  }
}

function fergieSwing(row: AnalyticsPickRow, preHome: number, preAway: number, swing: number): FergieSwing {
  return {
    home: row.homeTeam,
    away: row.awayTeam,
    homeCode: row.homeCode,
    awayCode: row.awayCode,
    predicted: `${row.homeGoals}-${row.awayGoals}`,
    actual: `${row.actualHome}-${row.actualAway}`,
    preStoppage: `${preHome}-${preAway}`,
    swing,
    isJoker: row.isJoker,
  }
}

interface TeamAcc {
  code: string | null
  name: string
  sample: number
  predictedWins: number
  actualWins: number
}

function toBias(acc: TeamAcc): TeamBias {
  const predictedWinRate = acc.predictedWins / acc.sample
  const actualWinRate = acc.actualWins / acc.sample
  return {
    code: acc.code,
    name: acc.name,
    sample: acc.sample,
    predictedWinRate: round2(predictedWinRate),
    actualWinRate: round2(actualWinRate),
    delta: round2(predictedWinRate - actualWinRate),
  }
}

// Pure aggregation over the user's scored picks - the whole report is derived
// here so it can be unit-tested without a database.
export function computeAnalytics(
  competitionName: string,
  rows: AnalyticsPickRow[],
  base: BasePoints = DEFAULT_BASE_POINTS,
): AnalyticsResponse {
  const emptyFergie: FergieTime = {
    matches: 0,
    goals: 0,
    netPoints: 0,
    pointsWon: 0,
    pointsLost: 0,
    biggestGain: null,
    biggestLoss: null,
  }
  const empty: AnalyticsResponse = {
    competitionName,
    hasData: false,
    totalPicks: 0,
    totalPoints: 0,
    avgPoints: 0,
    tiers: { exact: 0, diff: 0, outcome: 0, miss: 0 },
    accuracy: 0,
    exactRate: 0,
    goals: { predictedAvg: 0, actualAvg: 0, lean: 0 },
    outcomeLean: {
      predicted: { home: 0, draw: 0, away: 0 },
      actual: { home: 0, draw: 0, away: 0 },
      homeBiasPct: 0,
      drawGapPct: 0,
    },
    teams: { overrated: [], underrated: [] },
    overTime: [],
    bestCall: null,
    worstMiss: null,
    fergieTime: emptyFergie,
  }
  if (rows.length === 0) return empty

  const tiers: TierCounts = { exact: 0, diff: 0, outcome: 0, miss: 0 }
  const predicted = { home: 0, draw: 0, away: 0 }
  const actual = { home: 0, draw: 0, away: 0 }
  const teams = new Map<string, TeamAcc>()
  const roundMap = new Map<number, RoundAccuracy>()
  let totalPoints = 0
  let predictedGoals = 0
  let actualGoals = 0

  const bumpTeam = (code: string | null, name: string, predictedWin: boolean, actualWin: boolean) => {
    const key = code ?? name
    const acc = teams.get(key) ?? { code, name, sample: 0, predictedWins: 0, actualWins: 0 }
    acc.sample += 1
    if (predictedWin) acc.predictedWins += 1
    if (actualWin) acc.actualWins += 1
    teams.set(key, acc)
  }

  for (const row of rows) {
    const tier = tierOf(row)
    tiers[tier] += 1
    totalPoints += row.totalPoints
    predictedGoals += row.homeGoals + row.awayGoals
    actualGoals += row.actualHome + row.actualAway

    const predOutcome = outcomeOf({ home: row.homeGoals, away: row.awayGoals })
    const actOutcome = outcomeOf({ home: row.actualHome, away: row.actualAway })
    predicted[predOutcome.toLowerCase() as Lowercase<Outcome>] += 1
    actual[actOutcome.toLowerCase() as Lowercase<Outcome>] += 1

    bumpTeam(row.homeCode, row.homeTeam, predOutcome === 'HOME', actOutcome === 'HOME')
    bumpTeam(row.awayCode, row.awayTeam, predOutcome === 'AWAY', actOutcome === 'AWAY')

    const bucket = roundMap.get(row.roundOrder) ?? {
      label: row.roundLabel,
      order: row.roundOrder,
      picks: 0,
      accuracy: 0,
      points: 0,
    }
    bucket.picks += 1
    bucket.points += row.totalPoints
    if (tier !== 'miss') bucket.accuracy += 1
    roundMap.set(row.roundOrder, bucket)
  }

  const totalPicks = rows.length
  const correct = tiers.exact + tiers.diff + tiers.outcome
  const pct = (n: number) => (n / totalPicks) * 100

  const biases = [...teams.values()].filter((t) => t.sample >= MIN_TEAM_SAMPLE).map(toBias)
  // Ties on both lists break to the larger sample, so a well-evidenced bias
  // outranks a marginal one. Over-rated leads with the largest positive delta,
  // under-rated with the most-negative - only the delta ordering flips.
  const bySample = (a: TeamBias, b: TeamBias) => b.sample - a.sample
  const overrated = [...biases].sort((a, b) => b.delta - a.delta || bySample(a, b)).filter((t) => t.delta > 0).slice(0, TOP_TEAMS)
  const underrated = [...biases].sort((a, b) => a.delta - b.delta || bySample(a, b)).filter((t) => t.delta < 0).slice(0, TOP_TEAMS)

  const overTime = [...roundMap.values()]
    .sort((a, b) => a.order - b.order)
    .map((r) => ({ ...r, accuracy: round2(r.accuracy / r.picks) }))

  const bestCall = rows.reduce((best, row) =>
    row.totalPoints > best.totalPoints ||
    (row.totalPoints === best.totalPoints && TIER_RANK[row.baseTier ?? 'MISS'] > TIER_RANK[best.baseTier ?? 'MISS'])
      ? row
      : best,
  )
  const misses = rows.filter((r) => tierOf(r) === 'miss')
  const goalError = (r: AnalyticsPickRow) =>
    Math.abs(r.homeGoals - r.actualHome) + Math.abs(r.awayGoals - r.actualAway)
  const worstMiss = misses.length
    ? misses.reduce((worst, row) =>
        goalError(row) > goalError(worst) || (goalError(row) === goalError(worst) && row.isJoker && !worst.isJoker)
          ? row
          : worst,
      )
    : null

  // Fergie time: re-score each pick against the pre-stoppage line (added-time
  // goals removed) and bank the base-points swing. Only rows the loader marked
  // as reconciled carry non-zero stoppage counts, so no invented drama.
  const fergie: FergieTime = { ...emptyFergie, biggestGain: null, biggestLoss: null }
  for (const row of rows) {
    const stoppage = row.stoppageHome + row.stoppageAway
    if (stoppage === 0) continue
    const preHome = Math.max(0, row.actualHome - row.stoppageHome)
    const preAway = Math.max(0, row.actualAway - row.stoppageAway)
    const pred = { home: row.homeGoals, away: row.awayGoals }
    const actualPoints = basePointsFor(classifyTier(pred, { home: row.actualHome, away: row.actualAway }), base)
    const prePoints = basePointsFor(classifyTier(pred, { home: preHome, away: preAway }), base)
    const swing = actualPoints - prePoints
    fergie.matches += 1
    fergie.goals += stoppage
    if (swing > 0) {
      fergie.pointsWon += swing
      if (!fergie.biggestGain || swing > fergie.biggestGain.swing) {
        fergie.biggestGain = fergieSwing(row, preHome, preAway, swing)
      }
    } else if (swing < 0) {
      fergie.pointsLost += -swing
      if (!fergie.biggestLoss || swing < fergie.biggestLoss.swing) {
        fergie.biggestLoss = fergieSwing(row, preHome, preAway, swing)
      }
    }
  }
  fergie.netPoints = fergie.pointsWon - fergie.pointsLost

  return {
    competitionName,
    hasData: true,
    totalPicks,
    totalPoints,
    avgPoints: round2(totalPoints / totalPicks),
    tiers,
    accuracy: round2(correct / totalPicks),
    exactRate: round2(tiers.exact / totalPicks),
    goals: {
      predictedAvg: round2(predictedGoals / totalPicks),
      actualAvg: round2(actualGoals / totalPicks),
      lean: round2((predictedGoals - actualGoals) / totalPicks),
    },
    outcomeLean: {
      predicted,
      actual,
      homeBiasPct: round2(pct(predicted.home) - pct(actual.home)),
      drawGapPct: round2(pct(predicted.draw) - pct(actual.draw)),
    },
    teams: { overrated, underrated },
    overTime,
    bestCall: highlight(bestCall),
    worstMiss: worstMiss ? highlight(worstMiss) : null,
    fergieTime: fergie,
  }
}

export async function getAnalytics(
  db: AppDatabase,
  opts: { competitionId: string; userId: string },
): Promise<AnalyticsResponse> {
  const [comp] = await db
    .select({ name: competitionTable.name })
    .from(competitionTable)
    .where(eq(competitionTable.id, opts.competitionId))
    .limit(1)
  if (!comp) throw new NotFoundError('competition not found')

  const rows = await db
    .select({
      matchId: prediction.matchId,
      homeGoals: prediction.homeGoals,
      awayGoals: prediction.awayGoals,
      baseTier: prediction.baseTier,
      totalPoints: prediction.totalPoints,
      isJoker: prediction.isJoker,
      actualHome: match.fullTimeHome,
      actualAway: match.fullTimeAway,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeCode: match.homeTeamCode,
      awayCode: match.awayTeamCode,
      roundLabel: round.label,
      roundOrder: round.sortOrder,
    })
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .innerJoin(round, eq(round.id, prediction.roundId))
    .where(
      and(
        eq(prediction.userId, opts.userId),
        eq(match.competitionId, opts.competitionId),
        isNotNull(prediction.totalPoints),
        isNotNull(match.fullTimeHome),
        isNotNull(match.fullTimeAway),
      ),
    )
    .orderBy(asc(match.kickoffTime))

  // No scored picks means an empty report, independent of goals or point scale,
  // so skip the extra reads entirely.
  if (rows.length === 0) return computeAnalytics(comp.name, [])

  // Per-match goal tallies from the detail feed: total per side (to reconcile
  // against the full-time score) and how many of those fell in added time. A
  // minute like "45'+2'" or "90'+3'" carries a "+"; open-play minutes do not.
  const goals = await db
    .select({ matchId: goalEvent.matchId, side: goalEvent.side, minute: goalEvent.minute })
    .from(goalEvent)
    .where(eq(goalEvent.competitionId, opts.competitionId))

  const tally = new Map<string, { home: number; away: number; stopHome: number; stopAway: number }>()
  for (const g of goals) {
    const acc = tally.get(g.matchId) ?? { home: 0, away: 0, stopHome: 0, stopAway: 0 }
    const stoppage = g.minute?.includes('+') ?? false
    if (g.side === 'HOME') {
      acc.home += 1
      if (stoppage) acc.stopHome += 1
    } else {
      acc.away += 1
      if (stoppage) acc.stopAway += 1
    }
    tally.set(g.matchId, acc)
  }

  const stoppageFor = (matchId: string, actualHome: number, actualAway: number) => {
    const t = tally.get(matchId)
    // No recorded goals, or a feed that disagrees with the final score, means we
    // cannot trust which goals were late - so this match contributes no swing.
    if (!t || t.home !== actualHome || t.away !== actualAway) return { home: 0, away: 0 }
    return { home: t.stopHome, away: t.stopAway }
  }

  const clean: AnalyticsPickRow[] = rows.map((r) => {
    const actualHome = r.actualHome as number
    const actualAway = r.actualAway as number
    const stoppage = stoppageFor(r.matchId, actualHome, actualAway)
    return {
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      baseTier: r.baseTier,
      // isNotNull-filtered in the query, so never actually null here.
      totalPoints: r.totalPoints as number,
      isJoker: r.isJoker,
      actualHome,
      actualAway,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      homeCode: r.homeCode,
      awayCode: r.awayCode,
      roundLabel: r.roundLabel,
      roundOrder: r.roundOrder,
      stoppageHome: stoppage.home,
      stoppageAway: stoppage.away,
    }
  })
  const { rules } = await getScoringConfigFor(db, opts.competitionId)
  return computeAnalytics(comp.name, clean, rules.base)
}
