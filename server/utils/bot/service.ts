import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { championPick, leagueMember, match, prediction, round } from '../../../db/schema'
import { countsDouble, isSingleMatchStage } from '../../../shared/types/match'
import type { ScoringRules } from '../scoring/config'
import { scoreSyntheticPrediction } from '../scoring/engine'
import { getActiveScoringConfig } from '../scoring/store'
import { getLeaderboard } from '../leaderboard/service'

export const BOT_USER_ID = '__bot__'
// Below this many distinct predictors, the most-common scoreline is noise, not
// consensus - the MODE method falls back to MEAN (mirrors crowdMinDenominator).
export const MIN_CONSENSUS_USERS = 5

export type ConsensusMethod = 'MODE' | 'MEAN'

export interface Consensus {
  home: number
  away: number
  // How many of the scoped predictions picked exactly this scoreline.
  count: number
  total: number
}

export function computeConsensus(rows: { home: number; away: number }[], method: ConsensusMethod): Consensus | null {
  if (rows.length === 0) return null

  if (method === 'MEAN') {
    const home = Math.round(rows.reduce((sum, r) => sum + r.home, 0) / rows.length)
    const away = Math.round(rows.reduce((sum, r) => sum + r.away, 0) / rows.length)
    const count = rows.filter((r) => r.home === home && r.away === away).length
    return { home, away, count, total: rows.length }
  }

  if (rows.length < MIN_CONSENSUS_USERS) return null
  const counts = new Map<string, { home: number; away: number; count: number }>()
  for (const r of rows) {
    const key = `${r.home}-${r.away}`
    const entry = counts.get(key)
    if (entry) entry.count += 1
    else counts.set(key, { home: r.home, away: r.away, count: 1 })
  }
  // Ties: the crowd "means" the more conservative score, home advantage last.
  const best = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.home + a.away - (b.home + b.away) || b.home - a.home,
  )[0]
  return { home: best.home, away: best.away, count: best.count, total: rows.length }
}

export interface BotMatchRow {
  id: string
  userId: string
  matchId: string
  roundId: string
  homeGoals: number
  awayGoals: number
  isJoker: boolean
  baseTier: string | null
  totalPoints: number | null
  basePoints: number | null
  bonusPoints: number | null
  crowdShare: string | null
  jokerMultiplierApplied: string | null
  homeTeam: string
  awayTeam: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  kickoffTime: Date
  status: string
  stage: string
  fullTimeHome: number | null
  fullTimeAway: number | null
  penaltiesHome: number | null
  penaltiesAway: number | null
  roundLabel: string
  roundSort: number
  consensusCount: number
  consensusTotal: number
}

export interface BotChampion {
  teamCode: string
  teamName: string
  count: number
  total: number
  awardedPoints: number
}

export interface BotSummary {
  rank: number | null
  totalPoints: number
  predictionPoints: number
  championPoints: number
  exactCount: number
  outcomeCount: number
  gdCount: number
}

export interface BotOverview {
  method: ConsensusMethod
  modeAvailable: boolean
  population: number
  rows: BotMatchRow[]
  champion: BotChampion | null
  summary: BotSummary
  // False until at least one consensus row has been scored - the ghost row
  // only exists once the bot has actual points to show.
  hasScores: boolean
}

export interface BotScopeOptions {
  method?: ConsensusMethod
  // League hook: scope consensus, joker, champion and rank to the members.
  // The bonus histogram intentionally stays competition-wide - real points
  // were awarded against the full locked crowd.
  leagueId?: string
  includeUpcoming?: boolean
}

// The bot's champion pick is the team most users picked.
export async function getBotChampion(
  db: AppDatabase,
  competitionId: string,
  rules: ScoringRules,
  opts: { leagueId?: string } = {},
): Promise<BotChampion | null> {
  let query = db
    .select({ teamCode: championPick.teamCode, teamName: championPick.teamName })
    .from(championPick)
    .$dynamic()
  if (opts.leagueId) {
    query = query.innerJoin(
      leagueMember,
      and(eq(leagueMember.userId, championPick.userId), eq(leagueMember.leagueId, opts.leagueId)),
    )
  }
  const picks = await query.where(eq(championPick.competitionId, competitionId))

  const counts = new Map<string, { teamCode: string; teamName: string; count: number }>()
  for (const p of picks) {
    if (!p.teamCode) continue
    const entry = counts.get(p.teamCode)
    if (entry) entry.count += 1
    else counts.set(p.teamCode, { teamCode: p.teamCode, teamName: p.teamName, count: 1 })
  }
  if (counts.size === 0) return null
  const best = [...counts.values()].sort(
    (a, b) => b.count - a.count || (a.teamCode < b.teamCode ? -1 : 1),
  )[0]

  // Mirrors finalizeMatches: the bonus exists once a final has a decided winner.
  const finals = await db
    .select({ winner: match.winner, homeTeamCode: match.homeTeamCode, awayTeamCode: match.awayTeamCode })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), eq(match.stage, 'FINAL')))
  const decided = finals.find((m) => m.winner === 'HOME' || m.winner === 'AWAY')
  const winnerCode = decided ? (decided.winner === 'HOME' ? decided.homeTeamCode : decided.awayTeamCode) : null

  return {
    teamCode: best.teamCode,
    teamName: best.teamName,
    count: best.count,
    total: picks.length,
    awardedPoints: winnerCode !== null && winnerCode === best.teamCode ? rules.championBonus : 0,
  }
}

export async function getBotOverview(
  db: AppDatabase,
  competitionId: string,
  opts: BotScopeOptions = {},
  now: Date = new Date(),
): Promise<BotOverview> {
  const matches = await db
    .select({
      id: match.id,
      roundId: match.roundId,
      stage: match.stage,
      status: match.status,
      scoringState: match.scoringState,
      kickoffTime: match.kickoffTime,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeTeamCode: match.homeTeamCode,
      awayTeamCode: match.awayTeamCode,
      fullTimeHome: match.fullTimeHome,
      fullTimeAway: match.fullTimeAway,
      penaltiesHome: match.penaltiesHome,
      penaltiesAway: match.penaltiesAway,
      roundKind: round.kind,
      roundLabel: round.label,
      roundSort: round.sortOrder,
    })
    .from(match)
    .innerJoin(round, eq(round.id, match.roundId))
    .where(eq(match.competitionId, competitionId))
    .orderBy(match.kickoffTime)

  const allPredictions = await db
    .select({
      matchId: prediction.matchId,
      userId: prediction.userId,
      home: prediction.homeGoals,
      away: prediction.awayGoals,
      isJoker: prediction.isJoker,
      lockedAt: prediction.lockedAt,
    })
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .where(eq(match.competitionId, competitionId))

  const members = opts.leagueId
    ? new Set(
        (
          await db
            .select({ userId: leagueMember.userId })
            .from(leagueMember)
            .where(eq(leagueMember.leagueId, opts.leagueId))
        ).map((r) => r.userId),
      )
    : null
  const scoped = members ? allPredictions.filter((p) => members.has(p.userId)) : allPredictions

  const population = new Set(scoped.map((p) => p.userId)).size
  const modeAvailable = population >= MIN_CONSENSUS_USERS
  const requested = opts.method ?? 'MODE'
  const method: ConsensusMethod = requested === 'MODE' && !modeAvailable ? 'MEAN' : requested

  const scopedByMatch = new Map<string, typeof scoped>()
  for (const p of scoped) {
    const list = scopedByMatch.get(p.matchId)
    if (list) list.push(p)
    else scopedByMatch.set(p.matchId, [p])
  }
  const lockedByMatch = new Map<string, typeof allPredictions>()
  for (const p of allPredictions) {
    if (p.lockedAt === null) continue
    const list = lockedByMatch.get(p.matchId)
    if (list) list.push(p)
    else lockedByMatch.set(p.matchId, [p])
  }

  // The bot plays its joker where most of the scoped crowd played theirs.
  const jokerMatches = new Set<string>()
  const byRound = new Map<string, { matchId: string; kickoffTime: Date; count: number }[]>()
  for (const m of matches) {
    if (m.roundKind !== 'KNOCKOUT' || isSingleMatchStage(m.stage)) continue
    const count = (scopedByMatch.get(m.id) ?? []).filter((p) => p.isJoker).length
    if (count === 0) continue
    const list = byRound.get(m.roundId)
    if (list) list.push({ matchId: m.id, kickoffTime: m.kickoffTime, count })
    else byRound.set(m.roundId, [{ matchId: m.id, kickoffTime: m.kickoffTime, count }])
  }
  for (const candidates of byRound.values()) {
    candidates.sort(
      (a, b) =>
        b.count - a.count ||
        a.kickoffTime.getTime() - b.kickoffTime.getTime() ||
        (a.matchId < b.matchId ? -1 : 1),
    )
    jokerMatches.add(candidates[0].matchId)
  }

  const { rules } = await getActiveScoringConfig(db)

  const rows: BotMatchRow[] = []
  for (const m of matches) {
    if (!opts.includeUpcoming && m.kickoffTime > now) continue
    const consensus = computeConsensus(scopedByMatch.get(m.id) ?? [], method)
    if (!consensus) continue

    const isJoker = jokerMatches.has(m.id)
    const scored = m.scoringState === 'SCORED' && m.fullTimeHome !== null && m.fullTimeAway !== null
    const score = scored
      ? scoreSyntheticPrediction(
          {
            actual: { home: m.fullTimeHome!, away: m.fullTimeAway! },
            rules,
            predictions: (lockedByMatch.get(m.id) ?? []).map((p, i) => ({
              id: String(i),
              home: p.home,
              away: p.away,
              isJoker: p.isJoker,
            })),
            forceJoker: countsDouble(m.stage),
          },
          { id: m.id, home: consensus.home, away: consensus.away, isJoker },
        )
      : null

    rows.push({
      id: `bot-${m.id}`,
      userId: BOT_USER_ID,
      matchId: m.id,
      roundId: m.roundId,
      homeGoals: consensus.home,
      awayGoals: consensus.away,
      isJoker,
      baseTier: score?.baseTier ?? null,
      totalPoints: score?.totalPoints ?? null,
      basePoints: score?.basePoints ?? null,
      bonusPoints: score?.bonusPoints ?? null,
      crowdShare: score === null || score.crowdShare === null ? null : String(score.crowdShare),
      jokerMultiplierApplied: score === null ? null : String(score.jokerMultiplier),
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeTeamCode: m.homeTeamCode,
      awayTeamCode: m.awayTeamCode,
      kickoffTime: m.kickoffTime,
      status: m.status,
      stage: m.stage,
      fullTimeHome: m.fullTimeHome,
      fullTimeAway: m.fullTimeAway,
      penaltiesHome: m.penaltiesHome,
      penaltiesAway: m.penaltiesAway,
      roundLabel: m.roundLabel,
      roundSort: m.roundSort,
      consensusCount: consensus.count,
      consensusTotal: consensus.total,
    })
  }

  const champion = await getBotChampion(db, competitionId, rules, { leagueId: opts.leagueId })

  const scoredRows = rows.filter((r) => r.totalPoints !== null)
  const predictionPoints = scoredRows.reduce((sum, r) => sum + r.totalPoints!, 0)
  const championPoints = champion?.awardedPoints ?? 0
  const totalPoints = predictionPoints + championPoints
  const exactCount = scoredRows.filter((r) => r.baseTier === 'EXACT').length
  const gdCount = scoredRows.filter((r) => r.baseTier === 'EXACT' || r.baseTier === 'DIFF').length
  const outcomeCount = gdCount + scoredRows.filter((r) => r.baseTier === 'OUTCOME').length
  const hasScores = scoredRows.length > 0

  let rank: number | null = null
  if (hasScores) {
    const board = await getLeaderboard(db, { competitionId, leagueId: opts.leagueId, limit: 10000 })
    // Display-only ladder (the 4 numeric levels); real users win exact ties.
    rank =
      1 +
      board.filter(
        (r) =>
          (r.totalPoints - totalPoints ||
            r.exactCount - exactCount ||
            r.outcomeCount - outcomeCount ||
            r.gdCount - gdCount) >= 0,
      ).length
  }

  return {
    method,
    modeAvailable,
    population,
    rows,
    champion,
    summary: { rank, totalPoints, predictionPoints, championPoints, exactCount, outcomeCount, gdCount },
    hasScores,
  }
}
