import { and, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { league, leagueMember, leagueReward, user } from '../../../db/schema'
import {
  isTeamScopedCriterion,
  LEAGUE_REWARD_CRITERIA,
  type LeagueRewardCriterion,
  rewardMetricFor,
} from '#shared/types/rewards'
import type { LeagueRewardDto, MyRewardDto, RewardRankingDto, RewardStandingDto } from '#shared/types/rewards'
import { NotFoundError } from '../errors'
import { computeLeagueRewardWinners, rankLeagueCriterion } from './criteria'

// A route resolves the uploaded image to a storage key before calling the
// service, so the service stays storage-free (and unit-testable). imageKey:
// a key sets/replaces the image, null clears it, undefined keeps the current one.
export interface LeagueRewardWrite {
  type: LeagueRewardCriterion
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

// Resolve the names/avatars a viewer is allowed to see for a set of users, with
// the leaderboard's visibility rules: admin-hidden members stay hidden from
// everyone but themselves, and private profiles stay hidden from non-members.
// A concealed user maps to an empty name (and no avatar) so the caller can still
// show their slot without leaking identity.
async function resolveVisibleNames(
  db: AppDatabase,
  userIds: string[],
  viewerId: string | null,
  viewerIsMember: boolean,
): Promise<Map<string, { displayName: string; image: string | null }>> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: user.id, name: user.name, image: user.image, hidden: user.hiddenFromLeaderboard, isPrivate: user.profilePrivate })
    .from(user)
    .where(inArray(user.id, ids))
  return new Map(
    rows.map((u) => {
      const shown = u.id === viewerId || (!u.hidden && (!u.isPrivate || viewerIsMember))
      return [u.id, { displayName: shown ? u.name : '', image: shown ? u.image : null }] as const
    }),
  )
}

// Every criterion for a league: each configured prize + who currently leads it
// among the members (live/provisional, settles at competition end) + whether the
// viewer holds it. Winners tie-share; TEAM_SPECIALIST is multi-holder.
export async function getRewardStandings(
  db: AppDatabase,
  leagueId: string,
  viewerId: string | null,
): Promise<RewardStandingDto[]> {
  const [lg] = await db
    .select({ competitionId: league.competitionId, featuredTeamCode: league.featuredTeamCode })
    .from(league)
    .where(eq(league.id, leagueId))
    .limit(1)
  if (!lg) throw new NotFoundError('league not found')

  const memberIds = (
    await db.select({ userId: leagueMember.userId }).from(leagueMember).where(eq(leagueMember.leagueId, leagueId))
  ).map((m) => m.userId)
  const winners =
    memberIds.length > 0
      ? await computeLeagueRewardWinners(db, lg.competitionId, { leagueId, memberIds, featuredTeamCode: lg.featuredTeamCode })
      : []
  const rewards = new Map((await listLeagueRewards(db, leagueId)).map((r) => [r.type, r]))

  // Concealed leaders keep their slot (so the criterion still reads as "led") but
  // surface with an empty displayName.
  const viewerIsMember = viewerId !== null && memberIds.includes(viewerId)
  const visible = await resolveVisibleNames(db, winners.map((w) => w.userId), viewerId, viewerIsMember)

  return LEAGUE_REWARD_CRITERIA.map((type) => {
    // Sort by value desc so winners[0] is the top holder (most exacts for
    // TEAM_SPECIALIST); the card shows that holder plus "+N others". WOODEN_SPOON
    // has a single lowest-value holder set, so the order does not matter there.
    const typeWinners = winners.filter((w) => w.type === type).sort((a, b) => b.value - a.value)
    // TEAM_SPECIALIST names the league's featured team: null disables the criterion
    // until an owner/moderator picks one.
    const teamCode = isTeamScopedCriterion(type) ? lg.featuredTeamCode : null
    return {
      type,
      reward: rewards.get(type) ?? null,
      winners: typeWinners.map((w) => ({ userId: w.userId, displayName: visible.get(w.userId)?.displayName ?? '' })),
      value: typeWinners[0]?.value ?? 0,
      metric: rewardMetricFor(type),
      teamCode,
      disabled: type === 'TEAM_SPECIALIST' && !lg.featuredTeamCode,
      youHold: viewerId !== null && typeWinners.some((w) => w.userId === viewerId),
    }
  })
}

// Every configured prize across the user's leagues, for the cabinet strip: the
// ones they currently lead (youHold) and the ones they are chasing (tentative).
// Held prizes sort first.
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
      // A disabled criterion (TEAM_SPECIALIST with no featured team) can't be
      // earned yet, so it never shows in the cabinet - held or chased.
      if (s.reward && !s.disabled) {
        out.push({
          leagueId: m.leagueId,
          leagueName: m.leagueName,
          reward: s.reward,
          type: s.type,
          teamCode: s.teamCode,
          youHold: s.youHold,
        })
      }
    }
  }
  return out.sort((a, b) => Number(b.youHold) - Number(a.youHold))
}

// One criterion's full live ranking among a league's members, for the prize
// ranking dialog opened from a prize card. The rank-1 rows are the current
// leaders (the same set getRewardStandings reports as winners).
export async function getRewardRanking(
  db: AppDatabase,
  leagueId: string,
  type: LeagueRewardCriterion,
  viewerId: string | null,
): Promise<RewardRankingDto> {
  const [lg] = await db
    .select({ competitionId: league.competitionId, featuredTeamCode: league.featuredTeamCode })
    .from(league)
    .where(eq(league.id, leagueId))
    .limit(1)
  if (!lg) throw new NotFoundError('league not found')

  const memberIds = (
    await db.select({ userId: leagueMember.userId }).from(leagueMember).where(eq(leagueMember.leagueId, leagueId))
  ).map((m) => m.userId)

  // The featured team names the TEAM_SPECIALIST ranking even before anyone scores.
  const teamCode = isTeamScopedCriterion(type) ? lg.featuredTeamCode : null

  const ranked =
    memberIds.length > 0
      ? await rankLeagueCriterion(db, lg.competitionId, type, { leagueId, memberIds, featuredTeamCode: lg.featuredTeamCode })
      : []

  const viewerIsMember = viewerId !== null && memberIds.includes(viewerId)
  const visible = await resolveVisibleNames(db, ranked.map((r) => r.userId), viewerId, viewerIsMember)
  const reward = (await listLeagueRewards(db, leagueId)).find((r) => r.type === type) ?? null

  return {
    type,
    teamCode,
    reward,
    metric: rewardMetricFor(type),
    rows: ranked.map((r) => {
      const v = visible.get(r.userId)
      return {
        rank: r.rank,
        userId: r.userId,
        displayName: v?.displayName ?? '',
        image: v?.image ?? null,
        value: r.value,
        isViewer: r.userId === viewerId,
      }
    }),
  }
}
