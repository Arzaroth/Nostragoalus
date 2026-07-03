import { and, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { league, leagueMember, leagueReward, user } from '../../../db/schema'
import { COMPETITION_AWARD_TYPES, type CompetitionAwardType } from '#shared/types/achievements'
import type { LeagueRewardDto, MyRewardDto, RewardStandingDto } from '#shared/types/rewards'
import { NotFoundError } from '../errors'
import { computeCriteriaWinners } from '../awards/service'

// A route resolves the uploaded image to a storage key before calling the
// service, so the service stays storage-free (and unit-testable). imageKey:
// a key sets/replaces the image, null clears it, undefined keeps the current one.
export interface LeagueRewardWrite {
  type: CompetitionAwardType
  label: string
  imageKey?: string | null
  note?: string | null
  link?: string | null
}

// The prizes a league has configured, one per criterion (absent = no prize).
export async function listLeagueRewards(db: AppDatabase, leagueId: string): Promise<LeagueRewardDto[]> {
  const rows = await db.select().from(leagueReward).where(eq(leagueReward.leagueId, leagueId))
  return rows.map((r) => ({
    type: r.type,
    label: r.label,
    imageUrl: r.imageKey ? `/api/media/${r.imageKey}` : null,
    note: r.note,
    link: r.link,
  }))
}

// Upsert a league's prizes (owner/moderator only - the route authorizes). A blank
// label clears that criterion's prize.
export async function setLeagueRewards(db: AppDatabase, leagueId: string, inputs: LeagueRewardWrite[]): Promise<void> {
  for (const input of inputs) {
    if (input.label.trim() === '') {
      await db.delete(leagueReward).where(and(eq(leagueReward.leagueId, leagueId), eq(leagueReward.type, input.type)))
      continue
    }
    await db
      .insert(leagueReward)
      .values({
        leagueId,
        type: input.type,
        label: input.label.trim(),
        imageKey: input.imageKey ?? null,
        note: input.note ?? null,
        link: input.link ?? null,
      })
      .onConflictDoUpdate({
        target: [leagueReward.leagueId, leagueReward.type],
        set: {
          label: input.label.trim(),
          note: input.note ?? null,
          link: input.link ?? null,
          // Only touch the image when the caller sent one (key) or cleared it (null).
          ...(input.imageKey !== undefined ? { imageKey: input.imageKey } : {}),
        },
      })
  }
}

// The five criteria for a league: each configured prize + who currently leads it
// among the members (live/provisional, settles at competition end) + whether the
// viewer holds it. Winners tie-share.
export async function getRewardStandings(
  db: AppDatabase,
  leagueId: string,
  viewerId: string | null,
): Promise<RewardStandingDto[]> {
  const [lg] = await db.select({ competitionId: league.competitionId }).from(league).where(eq(league.id, leagueId)).limit(1)
  if (!lg) throw new NotFoundError('league not found')

  const memberIds = (
    await db.select({ userId: leagueMember.userId }).from(leagueMember).where(eq(leagueMember.leagueId, leagueId))
  ).map((m) => m.userId)
  const winners = memberIds.length > 0 ? await computeCriteriaWinners(db, lg.competitionId, { leagueId, memberIds }) : []
  const rewards = new Map((await listLeagueRewards(db, leagueId)).map((r) => [r.type, r]))

  const winnerIds = [...new Set(winners.map((w) => w.userId))]
  const names = new Map(
    winnerIds.length > 0
      ? (await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, winnerIds))).map(
          (u) => [u.id, u.name] as const,
        )
      : [],
  )

  return COMPETITION_AWARD_TYPES.map((type) => {
    const typeWinners = winners.filter((w) => w.type === type)
    return {
      type,
      reward: rewards.get(type) ?? null,
      winners: typeWinners.map((w) => ({ userId: w.userId, displayName: names.get(w.userId) ?? '' })),
      value: typeWinners[0]?.value ?? 0,
      teamCode: typeWinners[0]?.teamCode ?? null,
      youHold: viewerId !== null && typeWinners.some((w) => w.userId === viewerId),
    }
  })
}

// Every prize the user currently holds across their leagues, for the cabinet strip.
export async function getMyRewards(db: AppDatabase, userId: string): Promise<MyRewardDto[]> {
  const memberships = await db
    .select({ leagueId: leagueMember.leagueId, leagueName: league.name })
    .from(leagueMember)
    .innerJoin(league, eq(league.id, leagueMember.leagueId))
    .where(eq(leagueMember.userId, userId))

  const out: MyRewardDto[] = []
  for (const m of memberships) {
    const standings = await getRewardStandings(db, m.leagueId, userId)
    for (const s of standings) {
      if (s.youHold && s.reward) out.push({ leagueId: m.leagueId, leagueName: m.leagueName, reward: s.reward })
    }
  }
  return out
}
