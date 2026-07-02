import { and, desc, eq, isNotNull, ne, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import {
  bestScorerPick,
  championPick,
  chatMessage,
  chatMessageReaction,
  competition,
  competitionAward,
  league,
  match,
  prediction,
  round,
  user,
  userAchievement,
} from '../../../db/schema'
import type { ReactionEmoji } from '#shared/reactions'
import type { CompetitionAwardType, AchievementTier } from '#shared/types/achievements'
import type {
  WrappedDto,
  WrappedJourneyPointDto,
  WrappedPickDto,
  WrappedResponse,
} from '#shared/types/wrapped'
import { NotFoundError } from '../errors'
import { hasDecidedFinal } from '../awards/service'
import { computeAchievementStats } from '../achievements/service'
import { compareLeaderboardRows, getLeaderboard } from '../leaderboard/service'

interface PickRow {
  matchId: string
  homeTeam: string
  awayTeam: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  roundLabel: string
  kickoffTime: Date
  predHome: number
  predAway: number
  actualHome: number | null
  actualAway: number | null
  tier: string | null
  totalPoints: number | null
  bonusPoints: number | null
  bonusSource: string | null
  crowdShare: string | null
  isJoker: boolean
}

function toPickDto(r: PickRow): WrappedPickDto {
  const crowdRaw = r.crowdShare == null ? null : Number(r.crowdShare)
  return {
    matchId: r.matchId,
    homeTeam: r.homeTeam,
    awayTeam: r.awayTeam,
    homeTeamCode: r.homeTeamCode,
    awayTeamCode: r.awayTeamCode,
    roundLabel: r.roundLabel,
    kickoffTime: r.kickoffTime.toISOString(),
    predHome: r.predHome,
    predAway: r.predAway,
    actualHome: r.actualHome,
    actualAway: r.actualAway,
    tier: r.tier,
    totalPoints: r.totalPoints ?? 0,
    bonusPoints: r.bonusPoints ?? 0,
    isJoker: r.isJoker,
    crowdSharePct: crowdRaw != null && Number.isFinite(crowdRaw) ? Math.round(crowdRaw * 100) : null,
  }
}

// Highest points first; ties go to the earlier kickoff, then matchId, so the
// featured pick is stable across calls.
function byPointsThenKickoff(a: PickRow, b: PickRow): number {
  return (
    (b.totalPoints ?? 0) - (a.totalPoints ?? 0) ||
    a.kickoffTime.getTime() - b.kickoffTime.getTime() ||
    (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0)
  )
}

// Replay the season: cumulative per-user aggregates after each round, ranked on
// the same points -> exact -> outcome -> goal-diff ladder as the leaderboard.
// Prediction points only - the champion/best-scorer bonuses land at finalize and
// have no mid-tournament timeline to attribute them to.
function replayJourney(
  rows: { userId: string; sortOrder: number; points: number; tier: string }[],
  rounds: { sortOrder: number; label: string }[],
  userId: string,
): WrappedJourneyPointDto[] {
  const byRound = new Map<number, typeof rows>()
  for (const r of rows) {
    const arr = byRound.get(r.sortOrder) ?? []
    arr.push(r)
    byRound.set(r.sortOrder, arr)
  }

  const cumulative = new Map<string, { totalPoints: number; exactCount: number; outcomeCount: number; gdCount: number }>()
  const journey: WrappedJourneyPointDto[] = []
  const ordered = [...rounds].sort((a, b) => a.sortOrder - b.sortOrder)

  for (const rnd of ordered) {
    const roundRows = byRound.get(rnd.sortOrder)
    if (!roundRows || roundRows.length === 0) continue
    for (const r of roundRows) {
      const agg = cumulative.get(r.userId) ?? { totalPoints: 0, exactCount: 0, outcomeCount: 0, gdCount: 0 }
      agg.totalPoints += r.points
      if (r.tier === 'EXACT') agg.exactCount += 1
      if (r.tier === 'EXACT' || r.tier === 'DIFF' || r.tier === 'OUTCOME') agg.outcomeCount += 1
      if (r.tier === 'EXACT' || r.tier === 'DIFF') agg.gdCount += 1
      cumulative.set(r.userId, agg)
    }
    if (!cumulative.has(userId)) continue
    const board = [...cumulative.entries()].map(([id, agg]) => ({ userId: id, ...agg }))
    board.sort(compareLeaderboardRows)
    // Standard competition ranking: ladder-level rows share a rank.
    let rank = 0
    let prev: string | null = null
    let userRank = 0
    board.forEach((r, i) => {
      const key = `${r.totalPoints}|${r.exactCount}|${r.outcomeCount}|${r.gdCount}`
      if (key !== prev) {
        rank = i + 1
        prev = key
      }
      if (r.userId === userId) userRank = rank
    })
    journey.push({
      roundLabel: rnd.label,
      sortOrder: rnd.sortOrder,
      rank: userRank,
      players: board.length,
      points: cumulative.get(userId)!.totalPoints,
    })
  }
  return journey
}

// The full post-final recap for one user. Pre-final it returns the teaser
// (ready: false) instead of throwing: not-yet is a state, not an error.
export async function getWrapped(
  db: AppDatabase,
  opts: { competitionId: string; userId: string },
): Promise<WrappedResponse> {
  const [comp] = await db
    .select({ name: competition.name })
    .from(competition)
    .where(eq(competition.id, opts.competitionId))
    .limit(1)
  if (!comp) throw new NotFoundError('competition not found')

  if (!(await hasDecidedFinal(db, opts.competitionId))) {
    return { ready: false, competitionName: comp.name }
  }

  const [profile] = await db
    .select({ name: user.name, image: user.image, hidden: user.hiddenFromLeaderboard, priv: user.profilePrivate })
    .from(user)
    .where(eq(user.id, opts.userId))
    .limit(1)
  if (!profile) throw new NotFoundError('user not found')

  // Every pick of this user in the competition, with the match context the
  // slides need. Scored-ness is per-row (totalPoints null = never settled).
  const pickRows: PickRow[] = await db
    .select({
      matchId: prediction.matchId,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeTeamCode: match.homeTeamCode,
      awayTeamCode: match.awayTeamCode,
      roundLabel: round.label,
      kickoffTime: match.kickoffTime,
      predHome: prediction.homeGoals,
      predAway: prediction.awayGoals,
      actualHome: match.fullTimeHome,
      actualAway: match.fullTimeAway,
      tier: prediction.baseTier,
      totalPoints: prediction.totalPoints,
      bonusPoints: prediction.bonusPoints,
      bonusSource: prediction.bonusSource,
      crowdShare: prediction.crowdShare,
      isJoker: prediction.isJoker,
    })
    .from(prediction)
    .innerJoin(match, and(eq(match.id, prediction.matchId), eq(match.competitionId, opts.competitionId)))
    .innerJoin(round, eq(round.id, prediction.roundId))
    .where(eq(prediction.userId, opts.userId))

  const scored = pickRows.filter((r) => r.totalPoints !== null)
  const tierCount = (t: string) => scored.filter((r) => r.tier === t).length

  const [scoredMatchesRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(match)
    .where(and(eq(match.competitionId, opts.competitionId), eq(match.scoringState, 'SCORED')))
  const scoredMatches = scoredMatchesRow?.n ?? 0

  // Final standings: rank against the visible board population, self always
  // included; a hidden/private user occupies no public position (mirrors
  // /api/me/stats).
  const board = await getLeaderboard(db, {
    competitionId: opts.competitionId,
    limit: 100_000,
    alwaysIncludeUserId: opts.userId,
  })
  const boardRow = board.find((r) => r.userId === opts.userId)
  const isExcluded = profile.hidden || profile.priv
  const rank = isExcluded ? null : (boardRow?.rank ?? null)
  const players = board.length - (isExcluded ? 1 : 0)
  const topPercent = rank !== null && players > 0 ? Math.max(1, Math.ceil((rank / players) * 100)) : null

  // Field exact-share for the matches this user missed: how gettable was it.
  const missedIds = new Set(scored.filter((r) => r.tier === 'MISS').map((r) => r.matchId))
  let biggestMiss: WrappedDto['biggestMiss'] = null
  if (missedIds.size > 0) {
    const fieldRows = await db
      .select({
        matchId: prediction.matchId,
        total: sql<number>`count(*)::int`,
        exact: sql<number>`count(*) filter (where ${prediction.baseTier} = 'EXACT')::int`,
      })
      .from(prediction)
      .innerJoin(match, and(eq(match.id, prediction.matchId), eq(match.competitionId, opts.competitionId)))
      .where(isNotNull(prediction.totalPoints))
      .groupBy(prediction.matchId)
    const shareByMatch = new Map(
      fieldRows.map((r) => [r.matchId, r.total > 0 ? Math.round((r.exact / r.total) * 100) : 0]),
    )
    const misses = scored
      .filter((r) => r.tier === 'MISS')
      .map((r) => ({ row: r, fieldExactPct: shareByMatch.get(r.matchId) ?? 0 }))
      .sort(
        (a, b) =>
          b.fieldExactPct - a.fieldExactPct ||
          a.row.kickoffTime.getTime() - b.row.kickoffTime.getTime() ||
          (a.row.matchId < b.row.matchId ? -1 : 1),
      )
    if (misses.length > 0 && misses[0].fieldExactPct > 0) {
      biggestMiss = { ...toPickDto(misses[0].row), fieldExactPct: misses[0].fieldExactPct }
    }
  }

  const jokerRows = pickRows.filter((r) => r.isJoker)
  const jokerScored = jokerRows.filter((r) => r.totalPoints !== null)
  const bestJoker = [...jokerScored].sort(byPointsThenKickoff)[0]

  const crowdRows = scored.filter((r) => r.bonusSource === 'CROWD' && (r.bonusPoints ?? 0) > 0)
  const biggestBonus = [...crowdRows].sort(
    (a, b) =>
      (b.bonusPoints ?? 0) - (a.bonusPoints ?? 0) ||
      a.kickoffTime.getTime() - b.kickoffTime.getTime() ||
      (a.matchId < b.matchId ? -1 : 1),
  )[0]

  const bestPick = [...scored].sort(byPointsThenKickoff)[0]

  // Streaks, perfect rounds and lone-wolf reuse the achievements derivation so
  // the recap and the badges can never disagree.
  const achievementStats = (await computeAchievementStats(db, opts.competitionId)).get(opts.userId)

  const [champRow] = await db
    .select({
      teamCode: championPick.teamCode,
      teamName: championPick.teamName,
      points: championPick.awardedPoints,
    })
    .from(championPick)
    .where(and(eq(championPick.competitionId, opts.competitionId), eq(championPick.userId, opts.userId)))
    .limit(1)
  const [scorerRow] = await db
    .select({
      playerName: bestScorerPick.playerName,
      teamCode: bestScorerPick.teamCode,
      points: bestScorerPick.awardedPoints,
    })
    .from(bestScorerPick)
    .where(and(eq(bestScorerPick.competitionId, opts.competitionId), eq(bestScorerPick.userId, opts.userId)))
    .limit(1)

  // Chat: counts only, scoped to this competition's leagues. Message bodies are
  // E2E encrypted; row counts and plaintext reaction glyphs are all the server
  // knows, and all Wrapped uses.
  const inCompLeague = and(eq(league.id, chatMessage.leagueId), eq(league.competitionId, opts.competitionId))
  const [msgRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatMessage)
    .innerJoin(league, inCompLeague)
    .where(and(eq(chatMessage.userId, opts.userId), ne(chatMessage.moderationState, 'REMOVED')))
  const givenRows = await db
    .select({ emoji: chatMessageReaction.emoji, n: sql<number>`count(*)::int` })
    .from(chatMessageReaction)
    .innerJoin(chatMessage, eq(chatMessage.id, chatMessageReaction.messageId))
    .innerJoin(league, inCompLeague)
    .where(eq(chatMessageReaction.userId, opts.userId))
    .groupBy(chatMessageReaction.emoji)
    .orderBy(desc(sql`count(*)`), chatMessageReaction.emoji)
  const [receivedRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chatMessageReaction)
    .innerJoin(chatMessage, eq(chatMessage.id, chatMessageReaction.messageId))
    .innerJoin(league, inCompLeague)
    .where(and(eq(chatMessage.userId, opts.userId), ne(chatMessageReaction.userId, opts.userId)))

  const trophies = await db
    .select({ type: competitionAward.type, value: competitionAward.value, teamCode: competitionAward.teamCode })
    .from(competitionAward)
    .where(and(eq(competitionAward.competitionId, opts.competitionId), eq(competitionAward.userId, opts.userId)))
  const badges = await db
    .select({ key: userAchievement.key, tier: userAchievement.tier })
    .from(userAchievement)
    .where(
      and(
        eq(userAchievement.userId, opts.userId),
        or(eq(userAchievement.competitionId, opts.competitionId), sql`${userAchievement.competitionId} is null`),
      ),
    )

  // Journey population = the same visible-or-self board the final rank uses.
  const journeyRows = await db
    .select({
      userId: prediction.userId,
      sortOrder: round.sortOrder,
      points: prediction.totalPoints,
      tier: prediction.baseTier,
    })
    .from(prediction)
    .innerJoin(match, and(eq(match.id, prediction.matchId), eq(match.competitionId, opts.competitionId)))
    .innerJoin(round, eq(round.id, prediction.roundId))
    .innerJoin(user, eq(user.id, prediction.userId))
    .where(
      and(
        isNotNull(prediction.totalPoints),
        or(
          eq(user.id, opts.userId),
          and(eq(user.hiddenFromLeaderboard, false), eq(user.profilePrivate, false)),
        ),
      ),
    )
  const rounds = await db
    .select({ sortOrder: round.sortOrder, label: round.label })
    .from(round)
    .where(eq(round.competitionId, opts.competitionId))
  const journey = replayJourney(
    journeyRows.map((r) => ({
      userId: r.userId,
      sortOrder: r.sortOrder,
      points: r.points ?? 0,
      tier: (r.tier as string) ?? 'MISS',
    })),
    rounds,
    opts.userId,
  )

  return {
    ready: true,
    competitionName: comp.name,
    displayName: profile.name,
    image: profile.image,
    totals: {
      totalPoints: boardRow?.totalPoints ?? 0,
      predictionPoints: boardRow?.predictionPoints ?? 0,
      championPoints: boardRow?.championPoints ?? 0,
      bestScorerPoints: boardRow?.bestScorerPoints ?? 0,
      rank,
      players,
      topPercent,
    },
    tiers: {
      exact: tierCount('EXACT'),
      diff: tierCount('DIFF'),
      outcome: tierCount('OUTCOME'),
      miss: tierCount('MISS'),
      predictions: pickRows.length,
      scoredMatches,
      completionPct: scoredMatches > 0 ? Math.round((scored.length / scoredMatches) * 100) : 0,
    },
    streaks: {
      exactStreak: achievementStats?.exactStreak ?? 0,
      scoringStreak: achievementStats?.scoringStreak ?? 0,
      perfectRounds: achievementStats?.perfectRounds ?? 0,
    },
    bestPick: bestPick ? toPickDto(bestPick) : null,
    biggestMiss,
    jokers: {
      played: jokerRows.length,
      points: jokerScored.reduce((s, r) => s + (r.totalPoints ?? 0), 0),
      best: bestJoker ? toPickDto(bestJoker) : null,
    },
    crowd: {
      bonusPoints: crowdRows.reduce((s, r) => s + (r.bonusPoints ?? 0), 0),
      biggestBonus: biggestBonus ? toPickDto(biggestBonus) : null,
      loneWolf: achievementStats?.loneWolf ?? 0,
    },
    meta: {
      champion: champRow
        ? { teamCode: champRow.teamCode, teamName: champRow.teamName, points: champRow.points, hit: champRow.points > 0 }
        : null,
      bestScorer: scorerRow
        ? { playerName: scorerRow.playerName, teamCode: scorerRow.teamCode, points: scorerRow.points, hit: scorerRow.points > 0 }
        : null,
    },
    chat: {
      messages: msgRow?.n ?? 0,
      reactionsGiven: givenRows.reduce((s, r) => s + r.n, 0),
      reactionsReceived: receivedRow?.n ?? 0,
      topEmoji: (givenRows[0]?.emoji as ReactionEmoji | undefined) ?? null,
    },
    haul: {
      trophies: trophies.map((t) => ({ type: t.type as CompetitionAwardType, value: t.value, teamCode: t.teamCode })),
      badges: badges.map((b) => ({ key: b.key, tier: b.tier as AchievementTier | null })),
    },
    journey,
  }
}
