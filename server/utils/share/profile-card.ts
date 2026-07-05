import { and, eq, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competitionAward, user, userAchievement } from '../../../db/schema'
import { getCompetitionById } from '../competitions/store'
import { getLeaderboard } from '../leaderboard/service'
import { NotFoundError } from '../errors'

// The leak-safe numbers a public profile card brags about: rank, points, exacts
// and the trophy/badge haul, for one user in one competition. Everything here is
// already visible on the (signed-in) profile page; the card just makes it
// shareable to signed-out friends via a signed token. A plain interface so the
// template builder stays a pure, database-free function.
export interface ProfileCardData {
  displayName: string
  competitionName: string
  rank: number | null
  players: number
  totalPoints: number
  exact: number
  trophies: number
  badges: number
}

export async function getProfileCard(
  db: AppDatabase,
  opts: { competitionId: string; userId: string },
): Promise<ProfileCardData> {
  const [profile] = await db.select({ name: user.name }).from(user).where(eq(user.id, opts.userId)).limit(1)
  if (!profile) throw new NotFoundError('user not found')
  const competition = await getCompetitionById(db, opts.competitionId)
  if (!competition) throw new NotFoundError('competition not found')

  // Rank the user against the same population the public board shows, but always
  // keep them on it so their own card carries their rank and points.
  const board = await getLeaderboard(db, {
    competitionId: opts.competitionId,
    limit: 100_000,
    alwaysIncludeUserId: opts.userId,
  })
  const row = board.find((r) => r.userId === opts.userId)

  const [{ n: trophies }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(competitionAward)
    .where(and(eq(competitionAward.competitionId, opts.competitionId), eq(competitionAward.userId, opts.userId)))
  const [{ n: badges }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(userAchievement)
    .where(
      and(
        eq(userAchievement.userId, opts.userId),
        or(eq(userAchievement.competitionId, opts.competitionId), sql`${userAchievement.competitionId} is null`),
      ),
    )

  return {
    displayName: profile.name,
    competitionName: competition.name,
    rank: row?.rank ?? null,
    players: board.length,
    totalPoints: row?.totalPoints ?? 0,
    exact: row?.exactCount ?? 0,
    trophies,
    badges,
  }
}
