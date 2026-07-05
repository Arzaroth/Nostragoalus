import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { championPick, leagueMember, match, prediction, round } from '../../../db/schema'
import { countsDouble, isSingleMatchStage, type AppStage, type MatchStatus } from '../../../shared/types/match'
import type { BaseTier } from '../scoring/tiers'
import type { ScoringRules } from '../scoring/config'
import { scoreSyntheticPrediction } from '../scoring/engine'
import { getScoringConfigFor } from '../scoring/store'
import { getLeaderboard } from '../leaderboard/service'
import { closingOddsForOutcome } from '../odds/store'
import { outcomeOf } from '../scoring/tiers'
import { createTtlCache } from '../cache/ttl-cache'

import { DRAW_SCORELINE, botUserId, type BotPersona, type ConsensusMethod } from '../../../shared/types/bot'

// Below this many distinct predictors, the most-common scoreline is noise, not
// consensus - the MODE method falls back to MEAN (mirrors crowdMinDenominator).
export const MIN_CONSENSUS_USERS = 5

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

// The per-match scoreline a persona plays over the scoped rows, with `count`
// re-derived as how many scoped predictions landed on exactly that scoreline:
//  - CONSENSUS: the crowd's own MODE/MEAN pick.
//  - EVIL_TWIN: that pick inverted (home/away swapped) - the winner reversed,
//    the margin kept, a draw its own twin. Scoped to one player (their own
//    predictions), this is simply each of their picks swapped.
//  - EQUALIZER: always a draw, ignoring the scoreline entirely.
// EQUALIZER needs only that someone predicted the match; the others inherit
// computeConsensus's null gate (MODE below the threshold omits the match).
export function botPick(
  rows: { home: number; away: number }[],
  persona: BotPersona,
  method: ConsensusMethod,
): Consensus | null {
  if (rows.length === 0) return null

  if (persona === 'EQUALIZER') {
    const { home, away } = DRAW_SCORELINE
    return { home, away, count: rows.filter((r) => r.home === home && r.away === away).length, total: rows.length }
  }

  const consensus = computeConsensus(rows, method)
  if (!consensus || persona === 'CONSENSUS') return consensus

  const home = consensus.away
  const away = consensus.home
  return { home, away, count: rows.filter((r) => r.home === home && r.away === away).length, total: rows.length }
}

export interface BotMatchRow {
  id: string
  userId: string
  matchId: string
  roundId: string
  homeGoals: number
  awayGoals: number
  isJoker: boolean
  baseTier: BaseTier | null
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
  status: MatchStatus
  stage: AppStage
  fullTimeHome: number | null
  fullTimeAway: number | null
  penaltiesHome: number | null
  penaltiesAway: number | null
  roundLabel: string
  roundSort: number
  consensusCount: number
  consensusTotal: number
  consensusMethod: ConsensusMethod
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

// The real player the evil twin belongs to, from the same board it's ranked
// against, so a profile can show "twin would rank #8 vs your #4".
export interface BotSubject {
  rank: number
  totalPoints: number
  exactCount: number
  outcomeCount: number
}

export interface BotOverview {
  persona: BotPersona
  method: ConsensusMethod
  modeAvailable: boolean
  population: number
  rows: BotMatchRow[]
  champion: BotChampion | null
  summary: BotSummary
  // The scoped player's own real standing (only when userId is set - the evil
  // twin), for comparison. Null if they're off the board (e.g. private).
  subject: BotSubject | null
  // False until at least one consensus row has been scored - the ghost row
  // only exists once the bot has actual points to show.
  hasScores: boolean
}

export interface BotScopeOptions {
  // Which bot to compute; defaults to the original consensus ghost.
  persona?: BotPersona
  method?: ConsensusMethod
  // The EVIL_TWIN is per-user: scoped to this single player's own picks (each
  // scoreline swapped), keeping their jokers and champion. Required for that
  // persona; ignored by the crowd-derived CONSENSUS/EQUALIZER.
  userId?: string
  // League hook: scope consensus, joker, champion and rank to the members.
  // The bonus histogram intentionally stays competition-wide - real points
  // were awarded against the full locked crowd.
  leagueId?: string
  includeUpcoming?: boolean
  // Rank the bot against the same board the viewer sees: league mates/admins
  // see private profiles, so their board includes them.
  includePrivate?: boolean
}

// The bot's champion pick: the most-picked team across the scope. EQUALIZER
// names no champion (a draw-caller has no winner to crown). With `userId` the
// scope is a single player - their own champion pick - which the per-user EVIL
// TWIN keeps unchanged (it only swaps scorelines).
export async function getBotChampion(
  db: AppDatabase,
  competitionId: string,
  opts: { leagueId?: string; userId?: string; persona?: BotPersona } = {},
): Promise<BotChampion | null> {
  const persona = opts.persona ?? 'CONSENSUS'
  if (persona === 'EQUALIZER') return null
  let query = db
    .select({
      teamCode: championPick.teamCode,
      teamName: championPick.teamName,
      potentialPoints: championPick.potentialPoints,
    })
    .from(championPick)
    .$dynamic()
  if (opts.leagueId) {
    query = query.innerJoin(
      leagueMember,
      and(eq(leagueMember.userId, championPick.userId), eq(leagueMember.leagueId, opts.leagueId)),
    )
  }
  const scope = opts.userId
    ? and(eq(championPick.competitionId, competitionId), eq(championPick.userId, opts.userId))
    : eq(championPick.competitionId, competitionId)
  const picks = (await query.where(scope)).filter(
    (p): p is { teamCode: string; teamName: string; potentialPoints: number } => p.teamCode !== null,
  )

  const counts = new Map<string, { teamCode: string; teamName: string; count: number; points: number[] }>()
  for (const p of picks) {
    const entry = counts.get(p.teamCode)
    if (entry) {
      entry.count += 1
      entry.points.push(p.potentialPoints)
    } else {
      counts.set(p.teamCode, { teamCode: p.teamCode, teamName: p.teamName, count: 1, points: [p.potentialPoints] })
    }
  }
  if (counts.size === 0) return null
  const best = [...counts.values()].sort((a, b) => b.count - a.count || a.teamCode.localeCompare(b.teamCode))[0]

  // The bot's virtual pick pays what most of its crowd locked in for that team
  // (picks made at different times can carry different snapshots; ties go low).
  const pointTally = new Map<number, number>()
  for (const pts of best.points) pointTally.set(pts, (pointTally.get(pts) ?? 0) + 1)
  const botPoints = [...pointTally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]

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
    total: picks.length, // null-team picks already filtered out
    awardedPoints: winnerCode !== null && winnerCode === best.teamCode ? botPoints : 0,
  }
}

const EMPTY_SUMMARY: BotSummary = {
  rank: null,
  totalPoints: 0,
  predictionPoints: 0,
  championPoints: 0,
  exactCount: 0,
  outcomeCount: 0,
  gdCount: 0,
}

export async function getBotOverview(
  db: AppDatabase,
  competitionId: string,
  opts: BotScopeOptions = {},
  now: Date = new Date(),
): Promise<BotOverview> {
  const persona = opts.persona ?? 'CONSENSUS'
  // The evil twin is per-user; with no viewer it has nothing to swap, and must
  // not silently fall back to inverting the whole crowd.
  if (persona === 'EVIL_TWIN' && !opts.userId) {
    return { persona, method: 'MEAN', modeAvailable: false, population: 0, rows: [], champion: null, summary: EMPTY_SUMMARY, subject: null, hasScores: false }
  }

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
  // The evil twin derives from one player's own picks; league scope (if any)
  // still applies to the ranking board, not to whose picks the twin swaps.
  const scoped = allPredictions.filter(
    (p) => (!members || members.has(p.userId)) && (!opts.userId || p.userId === opts.userId),
  )

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

  // The bot plays one joker per multi-match knockout round; the persona decides
  // which match. CONSENSUS doubles where most of the crowd jokered; EVIL_TWIN,
  // scoped to one player, has only that player's jokered match as a candidate,
  // so it mirrors their joker; EQUALIZER takes the most drawish match (smallest
  // crowd margin). A lower key sorts first; ties break by earliest kickoff then id.
  const jokerMatches = new Set<string>()
  const byRound = new Map<string, { matchId: string; kickoffTime: Date; key: number }[]>()
  for (const m of matches) {
    if (m.roundKind !== 'KNOCKOUT' || isSingleMatchStage(m.stage)) continue
    const jokerRows = scopedByMatch.get(m.id) ?? []
    let key: number | null
    if (persona === 'EQUALIZER') {
      const c = computeConsensus(jokerRows, 'MEAN')
      key = c ? Math.abs(c.home - c.away) : null
    } else {
      const jokers = jokerRows.filter((p) => p.isJoker).length
      key = jokers === 0 ? null : persona === 'EVIL_TWIN' ? jokers : -jokers
    }
    if (key === null) continue
    const list = byRound.get(m.roundId)
    const entry = { matchId: m.id, kickoffTime: m.kickoffTime, key }
    if (list) list.push(entry)
    else byRound.set(m.roundId, [entry])
  }
  for (const candidates of byRound.values()) {
    candidates.sort(
      (a, b) =>
        a.key - b.key ||
        a.kickoffTime.getTime() - b.kickoffTime.getTime() ||
        a.matchId.localeCompare(b.matchId),
    )
    jokerMatches.add(candidates[0].matchId)
  }

  const { rules } = await getScoringConfigFor(db, competitionId)

  const rows: BotMatchRow[] = []
  for (const m of matches) {
    if (!opts.includeUpcoming && m.kickoffTime > now) continue
    const pick = botPick(scopedByMatch.get(m.id) ?? [], persona, method)
    if (!pick) continue

    const isJoker = jokerMatches.has(m.id)
    const scored = m.scoringState === 'SCORED' && m.fullTimeHome !== null && m.fullTimeAway !== null
    // Under the ODDS bonus config the bot must score against the same closing
    // odds real users got (else its identical pick scores less); CROWD ignores it.
    const actualOutcomeOdds =
      scored && rules.bonusSource === 'ODDS'
        ? await closingOddsForOutcome(db, m.id, m.kickoffTime, outcomeOf({ home: m.fullTimeHome!, away: m.fullTimeAway! }))
        : null
    const score = scored
      ? scoreSyntheticPrediction(
          {
            actual: { home: m.fullTimeHome!, away: m.fullTimeAway! },
            rules,
            actualOutcomeOdds,
            predictions: (lockedByMatch.get(m.id) ?? []).map((p, i) => ({
              id: String(i),
              home: p.home,
              away: p.away,
              isJoker: p.isJoker,
            })),
            forceJoker: countsDouble(m.stage),
          },
          { id: m.id, home: pick.home, away: pick.away, isJoker },
        )
      : null

    rows.push({
      id: `bot-${m.id}`,
      userId: botUserId(persona),
      matchId: m.id,
      roundId: m.roundId,
      homeGoals: pick.home,
      awayGoals: pick.away,
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
      // The per-user evil twin has no crowd context, so it shows no "picked by"
      // badge (total 0 hides it); the crowd personas keep it. The equalizer
      // reports MODE-style so the badge shows how many of the crowd matched its
      // draw call rather than "mean of N".
      consensusCount: persona === 'EVIL_TWIN' ? 0 : pick.count,
      consensusTotal: persona === 'EVIL_TWIN' ? 0 : pick.total,
      consensusMethod: persona === 'CONSENSUS' ? method : 'MODE',
    })
  }

  const champion = await getBotChampion(db, competitionId, { leagueId: opts.leagueId, userId: opts.userId, persona })

  const scoredRows = rows.filter((r) => r.totalPoints !== null)
  const predictionPoints = scoredRows.reduce((sum, r) => sum + r.totalPoints!, 0)
  const championPoints = champion?.awardedPoints ?? 0
  const totalPoints = predictionPoints + championPoints
  const exactCount = scoredRows.filter((r) => r.baseTier === 'EXACT').length
  const gdCount = scoredRows.filter((r) => r.baseTier === 'EXACT' || r.baseTier === 'DIFF').length
  const outcomeCount = gdCount + scoredRows.filter((r) => r.baseTier === 'OUTCOME').length
  const hasScores = scoredRows.length > 0

  // Rank the bot as soon as anyone has predicted, even before any match is
  // scored (it sits last on a 0-point board) - so the ghost row is visible the
  // moment the toggle is on, not only once it has points.
  let rank: number | null = null
  let subject: BotSubject | null = null
  if (population > 0) {
    const board = await getLeaderboard(db, { competitionId, leagueId: opts.leagueId, includePrivate: opts.includePrivate, limit: 10000 })
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
    // For the evil twin, the scoped player's own row on that same board, so a
    // profile can put the twin's would-be rank next to the player's real one.
    const s = opts.userId ? board.find((r) => r.userId === opts.userId) : undefined
    if (s) subject = { rank: s.rank, totalPoints: s.totalPoints, exactCount: s.exactCount, outcomeCount: s.outcomeCount }
  }

  return {
    persona,
    method,
    modeAvailable,
    population,
    rows,
    champion,
    summary: { rank, totalPoints, predictionPoints, championPoints, exactCount, outcomeCount, gdCount },
    subject,
    hasScores,
  }
}


// getBotOverview scans every prediction + re-runs the leaderboard query, and
// its result is identical for everyone sharing (competition, league, method,
// visibility). A short in-process TTL collapses the per-request cost during a
// busy leaderboard view; the bot is display-only so brief staleness is fine.
const botCache = createTtlCache<string, BotOverview>({ ttlMs: 30_000 })

export async function getBotOverviewCached(
  db: AppDatabase,
  competitionId: string,
  opts: BotScopeOptions = {},
): Promise<BotOverview> {
  const key = [
    competitionId,
    opts.persona ?? 'CONSENSUS',
    opts.userId ?? '',
    opts.leagueId ?? '',
    opts.method ?? '',
    opts.includeUpcoming ? 1 : 0,
    opts.includePrivate ? 1 : 0,
  ].join('|')
  const hit = botCache.get(key)
  if (hit) return hit
  const value = await getBotOverview(db, competitionId, opts)
  botCache.set(key, value)
  return value
}

// Test seam: drop memoized entries so a fresh computation runs.
export function clearBotCache(): void {
  botCache.clear()
}
