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
import type { NotificationData } from '../../../shared/types/notifications'
import type { AchievementTier } from '../../../shared/types/achievements'
import type { TrophyAward } from '../awards/service'

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

// Shared result-notification shape for a "meta pick" (champion, best scorer):
// resolve the competition, fetch the winning pickers (each feature owns its own
// typed query + payload, since the tables and payload fields differ), and fan
// out one deduped notification each. dedupeKey is per competition, so re-running
// finalize never re-notifies. v1 only celebrates winners.
async function notifyMetaResult(
  db: AppDatabase,
  competitionId: string,
  dedupeKey: string,
  fetchWinners: () => Promise<{ userId: string; name: string; points: number }[]>,
  buildData: (winner: { name: string; points: number }, comp: { slug: string; name: string }) => NotificationData,
  collector?: PendingNotification[],
): Promise<void> {
  const comp = await competitionInfo(db, competitionId)
  if (!comp) return
  for (const w of await fetchWinners()) {
    await createNotification(db, { userId: w.userId, dedupeKey, data: buildData(w, comp) }, collector)
  }
}

// Tell everyone whose champion pick won, with the points they earned.
export async function notifyChampionResult(
  db: AppDatabase,
  competitionId: string,
  winnerCode: string | null,
  collector?: PendingNotification[],
): Promise<void> {
  if (!winnerCode) return
  await notifyMetaResult(
    db,
    competitionId,
    `champion-result:${competitionId}`,
    () =>
      db
        .select({ userId: championPick.userId, name: championPick.teamName, points: championPick.awardedPoints })
        .from(championPick)
        .where(and(eq(championPick.competitionId, competitionId), eq(championPick.teamCode, winnerCode))),
    (w, comp) => ({
      type: 'CHAMPION_RESULT',
      competitionSlug: comp.slug,
      competitionName: comp.name,
      teamName: w.name,
      points: w.points,
      won: true,
    }),
    collector,
  )
}

// Mirror of the champion result for the Golden Boot pickers who backed a top
// scorer. `winnerPlayerIds` is the (possibly tied) set of leaders.
export async function notifyBestScorerResult(
  db: AppDatabase,
  competitionId: string,
  winnerPlayerIds: string[],
): Promise<void> {
  if (winnerPlayerIds.length === 0) return
  await notifyMetaResult(
    db,
    competitionId,
    `best-scorer-result:${competitionId}`,
    () =>
      db
        .select({ userId: bestScorerPick.userId, name: bestScorerPick.playerName, points: bestScorerPick.awardedPoints })
        .from(bestScorerPick)
        .where(and(eq(bestScorerPick.competitionId, competitionId), inArray(bestScorerPick.playerId, winnerPlayerIds))),
    (w, comp) => ({
      type: 'BEST_SCORER_RESULT',
      competitionSlug: comp.slug,
      competitionName: comp.name,
      playerName: w.name,
      points: w.points,
      won: true,
    }),
  )
}

// Resolve a team's display name from its code within a competition (for the
// team-specialist trophy). Kept local so events.ts avoids importing champion
// service, which imports back into this module.
async function teamNameByCode(db: AppDatabase, competitionId: string, code: string): Promise<string | null> {
  const rows = await db
    .select({ hc: match.homeTeamCode, hn: match.homeTeam, ac: match.awayTeamCode, an: match.awayTeam })
    .from(match)
    .where(eq(match.competitionId, competitionId))
  for (const r of rows) {
    if (r.hc === code) return r.hn
    if (r.ac === code) return r.an
  }
  return null
}

// Tell the winners of the freshly-awarded competition-end trophies. dedupeKey is
// per (competition, trophy type), so a finalize re-run never re-pings.
export async function notifyTrophyAwarded(
  db: AppDatabase,
  competitionId: string,
  awards: TrophyAward[],
  collector?: PendingNotification[],
): Promise<void> {
  if (awards.length === 0) return
  const comp = await competitionInfo(db, competitionId)
  if (!comp) return
  for (const a of awards) {
    const teamName = a.teamCode ? await teamNameByCode(db, competitionId, a.teamCode) : null
    await createNotification(
      db,
      {
        userId: a.userId,
        dedupeKey: `trophy:${competitionId}:${a.type}`,
        data: {
          type: 'TROPHY_AWARDED',
          competitionSlug: comp.slug,
          competitionName: comp.name,
          userId: a.userId,
          trophyType: a.type,
          teamName,
        },
      },
      collector,
    )
  }
}

// Tell users about badges they just earned (or graded up). dedupeKey folds in the
// tier so each grade celebrates once; competitionId null = a global badge.
export async function notifyAchievementUnlocked(
  db: AppDatabase,
  unlocks: { userId: string; competitionId: string | null; key: string; tier: AchievementTier | null }[],
  collector?: PendingNotification[],
): Promise<void> {
  if (unlocks.length === 0) return
  const compCache = new Map<string, { slug: string; name: string } | null>()
  for (const u of unlocks) {
    let slug: string | null = null
    let name: string | null = null
    if (u.competitionId) {
      let info = compCache.get(u.competitionId)
      if (info === undefined) {
        info = await competitionInfo(db, u.competitionId)
        compCache.set(u.competitionId, info)
      }
      slug = info?.slug ?? null
      name = info?.name ?? null
    }
    await createNotification(
      db,
      {
        userId: u.userId,
        dedupeKey: `achievement:${u.competitionId ?? 'global'}:${u.key}:${u.tier ?? '_'}`,
        data: {
          type: 'ACHIEVEMENT_UNLOCKED',
          competitionSlug: slug,
          competitionName: name,
          userId: u.userId,
          key: u.key,
          tier: u.tier,
        },
      },
      collector,
    )
  }
}
