import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import {
  bestScorerPick,
  championPick,
  competition,
  league,
  leagueMember,
  match,
  prediction,
  user,
  userProfile,
} from '../../../db/schema'
import { createNotification, type PendingNotification } from './service'

type LeagueRole = 'OWNER' | 'MODERATOR' | 'MEMBER'

async function competitionInfo(db: AppDatabase, competitionId: string): Promise<{ slug: string; name: string } | null> {
  const rows = await db
    .select({ slug: competition.slug, name: competition.name })
    .from(competition)
    .where(eq(competition.id, competitionId))
    .limit(1)
  return rows[0] ?? null
}

async function leagueName(db: AppDatabase, leagueId: string): Promise<string | null> {
  const rows = await db.select({ name: league.name }).from(league).where(eq(league.id, leagueId)).limit(1)
  return rows[0]?.name ?? null
}

export async function displayName(db: AppDatabase, userId: string): Promise<string> {
  const rows = await db
    .select({ display: userProfile.displayName, name: user.name })
    .from(user)
    .leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0]?.display ?? rows[0]?.name ?? 'Someone'
}

// Tell a league's owner and moderators that a new member joined. The joiner is
// excluded, so claiming an ownerless league (first joiner becomes OWNER) never
// notifies someone about their own arrival.
export async function notifyLeagueJoin(db: AppDatabase, leagueId: string, joinerUserId: string): Promise<void> {
  const name = await leagueName(db, leagueId)
  if (!name) return
  const recipients = await db
    .select({ userId: leagueMember.userId })
    .from(leagueMember)
    .where(
      and(
        eq(leagueMember.leagueId, leagueId),
        inArray(leagueMember.role, ['OWNER', 'MODERATOR']),
        ne(leagueMember.userId, joinerUserId),
      ),
    )
  if (recipients.length === 0) return
  const joinerName = await displayName(db, joinerUserId)
  for (const r of recipients) {
    await createNotification(db, {
      userId: r.userId,
      data: { type: 'LEAGUE_JOIN', leagueId, leagueName: name, joinerName },
    })
  }
}

// A member gained a role: notify them. A demotion to MEMBER is silent (nothing
// to celebrate, and a "you were demoted" ping would only sting).
export async function notifyLeagueRole(db: AppDatabase, leagueId: string, userId: string, role: LeagueRole): Promise<void> {
  if (role !== 'OWNER' && role !== 'MODERATOR') return
  const name = await leagueName(db, leagueId)
  if (!name) return
  await createNotification(db, { userId, data: { type: 'LEAGUE_ROLE', leagueId, leagueName: name, role } })
}

export async function notifyLeagueRemoved(db: AppDatabase, leagueId: string, userId: string): Promise<void> {
  const name = await leagueName(db, leagueId)
  if (!name) return
  await createNotification(db, { userId, data: { type: 'LEAGUE_REMOVED', leagueId, leagueName: name } })
}

// A match was scored at finalize: tell everyone who predicted it how their pick
// fared, with the scoreline and the points it earned (0 for a miss). dedupeKey
// is per match, so finalize re-runs don't re-ping. NOTE: onConflictDoNothing
// keeps the FIRST notification - a later score correction or rescore does NOT
// refresh the stored scoreline/points (see TODO.md).
export async function notifyMatchResults(
  db: AppDatabase,
  matchId: string,
  collector?: PendingNotification[],
): Promise<void> {
  const rows = await db
    .select({
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore: match.fullTimeHome,
      awayScore: match.fullTimeAway,
      slug: competition.slug,
    })
    .from(match)
    .innerJoin(competition, eq(competition.id, match.competitionId))
    .where(eq(match.id, matchId))
    .limit(1)
  const m = rows[0]
  if (!m) return
  const predictors = await db
    .select({ userId: prediction.userId, points: prediction.totalPoints })
    .from(prediction)
    .where(and(eq(prediction.matchId, matchId), isNotNull(prediction.totalPoints)))
  for (const p of predictors) {
    await createNotification(
      db,
      {
        userId: p.userId,
        dedupeKey: `match-result:${matchId}`,
        data: {
          type: 'MATCH_RESULT',
          matchId,
          competitionSlug: m.slug,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeScore: m.homeScore ?? 0,
          awayScore: m.awayScore ?? 0,
          points: p.points ?? 0,
        },
      },
      collector,
    )
  }
}

// The final is decided: tell everyone whose champion pick won, with the points
// they earned. dedupeKey is per competition, so re-running finalize never
// re-notifies. v1 only celebrates winners; "didn't win" closure is deferred.
export async function notifyChampionResult(
  db: AppDatabase,
  competitionId: string,
  winnerCode: string | null,
  collector?: PendingNotification[],
): Promise<void> {
  if (!winnerCode) return
  const comp = await competitionInfo(db, competitionId)
  if (!comp) return
  const winners = await db
    .select({ userId: championPick.userId, teamName: championPick.teamName, points: championPick.awardedPoints })
    .from(championPick)
    .where(and(eq(championPick.competitionId, competitionId), eq(championPick.teamCode, winnerCode)))
  for (const w of winners) {
    await createNotification(
      db,
      {
        userId: w.userId,
        dedupeKey: `champion-result:${competitionId}`,
        data: {
          type: 'CHAMPION_RESULT',
          competitionSlug: comp.slug,
          competitionName: comp.name,
          teamName: w.teamName,
          points: w.points,
          won: true,
        },
      },
      collector,
    )
  }
}

// Mirror of the champion result for the Golden Boot pickers who backed a top
// scorer. `winnerPlayerIds` is the (possibly tied) set of leaders.
export async function notifyBestScorerResult(
  db: AppDatabase,
  competitionId: string,
  winnerPlayerIds: string[],
): Promise<void> {
  if (winnerPlayerIds.length === 0) return
  const comp = await competitionInfo(db, competitionId)
  if (!comp) return
  const winners = await db
    .select({ userId: bestScorerPick.userId, playerName: bestScorerPick.playerName, points: bestScorerPick.awardedPoints })
    .from(bestScorerPick)
    .where(and(eq(bestScorerPick.competitionId, competitionId), inArray(bestScorerPick.playerId, winnerPlayerIds)))
  for (const w of winners) {
    await createNotification(db, {
      userId: w.userId,
      dedupeKey: `best-scorer-result:${competitionId}`,
      data: {
        type: 'BEST_SCORER_RESULT',
        competitionSlug: comp.slug,
        competitionName: comp.name,
        playerName: w.playerName,
        points: w.points,
        won: true,
      },
    })
  }
}
