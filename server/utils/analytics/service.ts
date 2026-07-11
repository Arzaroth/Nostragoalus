import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition as competitionTable, goalEvent, match, prediction, round } from '../../../db/schema'
import { countsDouble, isKnockout } from '../../../shared/types/match'
import { NotFoundError } from '../errors'
import { outcomeOf, type Outcome } from '../scoring/tiers'
import { getScoringConfigFor } from '../scoring/store'
import { closingOddsForOutcome } from '../odds/store'
import type { PredictionInput } from '../scoring/engine'
import { computeFergie, emptyFergie, type FergieGoal, type FergieMatchInput } from './fergie'
import type {
  AnalyticsResponse,
  FergieTime,
  PickHighlight,
  RoundAccuracy,
  StreakSummary,
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

// Consecutive correct picks (at least a right outcome). `rows` arrive in
// chronological order, so the trailing run is the streak still live now and the
// longest run seen is the tournament best.
function computeStreak(rows: AnalyticsPickRow[]): StreakSummary {
  let current = 0
  let best = 0
  for (const row of rows) {
    if (tierOf(row) === 'miss') current = 0
    else current += 1
    if (current > best) best = current
  }
  return { current, best }
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
// here so it can be unit-tested without a database. Fergie time is priced
// separately (it needs the whole field to re-run the rarity bonus) and passed in.
export function computeAnalytics(
  competitionName: string,
  rows: AnalyticsPickRow[],
  fergieTime: FergieTime = emptyFergie(),
): AnalyticsResponse {
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
    streak: { current: 0, best: 0 },
    bestCall: null,
    worstMiss: null,
    fergieTime,
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
    streak: computeStreak(rows),
    bestCall: highlight(bestCall),
    worstMiss: worstMiss ? highlight(worstMiss) : null,
    fergieTime,
  }
}

// Loads the field, goal timelines and scoring context needed to price Fergie
// time, then hands them to the pure replay. Split out so getAnalytics stays a
// straight-line read and the heavy fan-out is isolated.
async function loadFergieTime(
  db: AppDatabase,
  competitionId: string,
  userRows: FergiePickRow[],
): Promise<FergieTime> {
  const { rules } = await getScoringConfigFor(db, competitionId)
  const matchIds = userRows.map((r) => r.matchId)

  // Ordered by id so a match's goals arrive in a stable sequence: the replay
  // re-sorts by parsed minute, but same-minute goals keep this deterministic
  // order across requests rather than whatever the planner returns.
  const goalRows = await db
    .select({ matchId: goalEvent.matchId, side: goalEvent.side, minute: goalEvent.minute })
    .from(goalEvent)
    .where(inArray(goalEvent.matchId, matchIds))
    .orderBy(asc(goalEvent.id))

  const goalsByMatch = new Map<string, FergieGoal[]>()
  const hasAdded = new Set<string>()
  for (const g of goalRows) {
    const list = goalsByMatch.get(g.matchId) ?? []
    list.push({ side: g.side, minute: g.minute })
    goalsByMatch.set(g.matchId, list)
    if (g.minute?.includes('+')) hasAdded.add(g.matchId)
  }

  // Only matches with an added-time goal can move Fergie time - restrict every
  // heavier load to that set.
  const fergieRows = userRows.filter((r) => hasAdded.has(r.matchId))
  if (fergieRows.length === 0) return emptyFergie()
  const fergieMatchIds = fergieRows.map((r) => r.matchId)

  // The whole locked field per match, exactly what finalize scored against, so
  // the rarity bonus can be re-derived at any hypothetical scoreline.
  const fieldRows = await db
    .select({
      matchId: prediction.matchId,
      id: prediction.id,
      home: prediction.homeGoals,
      away: prediction.awayGoals,
      isJoker: prediction.isJoker,
    })
    .from(prediction)
    .where(and(inArray(prediction.matchId, fergieMatchIds), isNotNull(prediction.lockedAt)))

  const fieldByMatch = new Map<string, PredictionInput[]>()
  for (const p of fieldRows) {
    const list = fieldByMatch.get(p.matchId) ?? []
    list.push({ id: p.id, home: p.home, away: p.away, isJoker: p.isJoker })
    fieldByMatch.set(p.matchId, list)
  }

  // ODDS scoring prices the bonus off the actual outcome's closing odds; for the
  // replay we need it for whichever outcome a hypothetical scoreline lands on, so
  // resolve all three per match up front. CROWD (the default) needs none.
  const oddsByMatch = new Map<string, Partial<Record<Outcome, number | null>>>()
  if (rules.bonusSource === 'ODDS') {
    const outcomes: Outcome[] = ['HOME', 'DRAW', 'AWAY']
    await Promise.all(
      fergieRows.map(async (r) => {
        const resolved = await Promise.all(outcomes.map((o) => closingOddsForOutcome(db, r.matchId, r.kickoffTime, o)))
        oddsByMatch.set(r.matchId, Object.fromEntries(outcomes.map((o, i) => [o, resolved[i]])))
      }),
    )
  }

  // .get(matchId) is a guaranteed hit here: fergieRows are the user's own locked
  // picks (so the field query returns their row) that hasAdded pulled straight
  // from goalsByMatch.
  const inputs: FergieMatchInput[] = fergieRows.map((r) => ({
    home: r.homeTeam,
    away: r.awayTeam,
    homeCode: r.homeCode,
    awayCode: r.awayCode,
    predId: r.predId,
    pred: { home: r.predHome, away: r.predAway },
    isJoker: r.isJoker,
    actual: { home: r.actualHome, away: r.actualAway },
    forceJoker: countsDouble(r.stage),
    isKnockout: isKnockout(r.stage),
    field: fieldByMatch.get(r.matchId)!,
    goals: goalsByMatch.get(r.matchId)!,
    oddsForOutcome: (o: Outcome) => oddsByMatch.get(r.matchId)?.[o] ?? null,
  }))

  return computeFergie(inputs, rules)
}

// The extra per-pick columns Fergie time needs on top of the bias-report row.
interface FergiePickRow {
  matchId: string
  predId: string
  predHome: number
  predAway: number
  isJoker: boolean
  actualHome: number
  actualAway: number
  homeTeam: string
  awayTeam: string
  homeCode: string | null
  awayCode: string | null
  stage: Parameters<typeof countsDouble>[0]
  kickoffTime: Date
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
      predId: prediction.id,
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
      stage: match.stage,
      kickoffTime: match.kickoffTime,
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

  // No scored picks means an empty report, so skip the extra reads entirely.
  if (rows.length === 0) return computeAnalytics(comp.name, [])

  const clean: AnalyticsPickRow[] = rows.map((r) => ({
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
    baseTier: r.baseTier,
    // isNotNull-filtered in the query, so never actually null here.
    totalPoints: r.totalPoints as number,
    isJoker: r.isJoker,
    actualHome: r.actualHome as number,
    actualAway: r.actualAway as number,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    homeCode: r.homeCode,
    awayCode: r.awayCode,
    roundLabel: r.roundLabel,
    roundOrder: r.roundOrder,
  }))

  const fergieRows: FergiePickRow[] = rows.map((r) => ({
    matchId: r.matchId,
    predId: r.predId,
    predHome: r.homeGoals,
    predAway: r.awayGoals,
    isJoker: r.isJoker,
    actualHome: r.actualHome as number,
    actualAway: r.actualAway as number,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    homeCode: r.homeCode,
    awayCode: r.awayCode,
    stage: r.stage,
    kickoffTime: r.kickoffTime,
  }))

  const fergieTime = await loadFergieTime(db, opts.competitionId, fergieRows)
  return computeAnalytics(comp.name, clean, fergieTime)
}
