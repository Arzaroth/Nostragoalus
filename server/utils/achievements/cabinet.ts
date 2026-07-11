import { and, count, eq, isNull, or } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competitionAward, showcasePin, user, userAchievement } from '../../../db/schema'
import {
  ACHIEVEMENT_TIERS,
  type AchievementRarityDto,
  type AchievementTier,
  type CabinetDto,
  COMPETITION_AWARD_TYPES,
  SHOWCASE_SLOT_COUNT,
  type ShowcasePinDto,
  type ShowcasePinInput,
} from '#shared/types/achievements'
import type { AchievementDef } from './catalog'
import { NotFoundError, ValidationError } from '../errors'
import { ALL_ACHIEVEMENTS } from './catalog'
import { computeAchievementStats } from './service'

// The trophies + achievements + showcase for one user in one competition. Global
// (competition-spanning) badges are folded in. Hidden badges only ever surface
// once earned - a locked secret is never revealed, so the surprise survives.
export async function getCabinet(
  db: AppDatabase,
  opts: { competitionId: string; userId: string; viewerId: string | null },
): Promise<CabinetDto> {
  const [profile] = await db.select({ name: user.name }).from(user).where(eq(user.id, opts.userId)).limit(1)
  if (!profile) throw new NotFoundError('user not found')

  const trophyRows = await db
    .select()
    .from(competitionAward)
    .where(and(eq(competitionAward.competitionId, opts.competitionId), eq(competitionAward.userId, opts.userId)))
  const order = new Map(COMPETITION_AWARD_TYPES.map((t, i) => [t, i]))
  const trophies = trophyRows
    .map((r) => ({ type: r.type, value: r.value, teamCode: r.teamCode, awardedAt: r.awardedAt.toISOString() }))
    .sort((a, b) => order.get(a.type)! - order.get(b.type)!)

  const earnedRows = await db
    .select()
    .from(userAchievement)
    .where(
      and(
        eq(userAchievement.userId, opts.userId),
        or(eq(userAchievement.competitionId, opts.competitionId), isNull(userAchievement.competitionId)),
      ),
    )
  const earnedByKey = new Map(earnedRows.map((r) => [r.key, r]))

  // Live metric values so a locked badge can still show "3 / 5 to the next tier".
  // Derived, not persisted (evaluateAchievements only stores progress once a tier is
  // reached), so this recompute is the read side of the same source of truth.
  const stats = await computeAchievementStats(db, opts.competitionId)
  const userStats = stats.get(opts.userId)

  // Rarity: how many of the competition's participants (stats has one entry per
  // player with a prediction) hold each badge, per tier. One competition-wide
  // grouped scan, merged onto every badge below.
  const participants = stats.size
  const holderRows = await db
    .select({ key: userAchievement.key, tier: userAchievement.tier, n: count() })
    .from(userAchievement)
    .where(or(eq(userAchievement.competitionId, opts.competitionId), isNull(userAchievement.competitionId)))
    .groupBy(userAchievement.key, userAchievement.tier)
  const holdersByKey = new Map<string, { tier: AchievementTier | null; n: number }[]>()
  for (const r of holderRows) {
    const list = holdersByKey.get(r.key) ?? []
    list.push({ tier: r.tier, n: Number(r.n) })
    holdersByKey.set(r.key, list)
  }
  // A null tier (legacy single-shot rows) counts as the lowest band.
  const rankOf = (t: AchievementTier | null): number => (t ? ACHIEVEMENT_TIERS.indexOf(t) + 1 : 1)
  const rarityFor = (def: AchievementDef): AchievementRarityDto[] => {
    if (participants === 0) return []
    const rows = holdersByKey.get(def.key) ?? []
    return def.tiers.map((t) => {
      const holders = rows.reduce((s, r) => (rankOf(r.tier) >= rankOf(t.tier) ? s + r.n : s), 0)
      return { tier: t.tier, pct: Math.round((holders / participants) * 1000) / 10 }
    })
  }

  // Streak badges also surface the CURRENT ongoing run beside the best (`current`),
  // while the badge is still climbing. Maps the badge metric to the matching cur* stat.
  const STREAK_CUR: Partial<Record<string, 'curExactStreak' | 'curScoringStreak' | 'curMissStreak'>> = {
    exactStreak: 'curExactStreak',
    scoringStreak: 'curScoringStreak',
    missStreak: 'curMissStreak',
  }

  const achievements = ALL_ACHIEVEMENTS.flatMap((def) => {
    const e = earnedByKey.get(def.key)
    const earned = e ? { tier: e.tier, progress: e.progress, unlockedAt: e.unlockedAt.toISOString() } : null
    if (def.hidden && !earned) return []
    // No progress bar on SHAME badges: you don't "chase" a bad badge, and a bar
    // would telegraph its threshold (how close you are to a cold streak).
    const current = def.metric && def.category !== 'SHAME' ? (userStats?.[def.metric] ?? 0) : null
    // Show the ongoing streak only on a still-climbing streak badge: hide it once the
    // top tier is reached (nothing left to chase) and never on SHAME badges. A run of
    // 0 (a just-broken streak) is nothing to show, so it hides too.
    const curField = def.metric ? STREAK_CUR[def.metric] : undefined
    const topThreshold = def.tiers[def.tiers.length - 1]?.threshold ?? Infinity
    const maxed = (current ?? 0) >= topThreshold
    const cur = curField && def.category !== 'SHAME' && !maxed ? (userStats?.[curField] ?? 0) : 0
    const currentStreak = cur > 0 ? cur : null
    return [
      {
        key: def.key,
        category: def.category,
        scope: def.scope,
        icon: def.icon ?? null,
        hidden: !!def.hidden,
        tiers: def.tiers,
        earned,
        current,
        currentStreak,
        rarity: rarityFor(def),
      },
    ]
  })

  const pins = await db
    .select()
    .from(showcasePin)
    .where(and(eq(showcasePin.userId, opts.userId), eq(showcasePin.competitionId, opts.competitionId)))
    .orderBy(showcasePin.slot)
  const showcase: ShowcasePinDto[] = pins.map((p) => ({ slot: p.slot, achievementKey: p.achievementKey }))

  return {
    userId: opts.userId,
    displayName: profile.name,
    isOwner: opts.viewerId === opts.userId,
    trophies,
    achievements,
    showcase,
  }
}

// Replace a user's showcase for a competition with the given ordered achievements.
// Every one must be an achievement the user has actually earned (no pinning
// aspirational badges), capped at SHOWCASE_SLOT_COUNT, no duplicates. Array order
// = slot order.
export async function setShowcase(
  db: AppDatabase,
  opts: { competitionId: string; userId: string; items: ShowcasePinInput[] },
): Promise<ShowcasePinDto[]> {
  const { items } = opts
  if (items.length > SHOWCASE_SLOT_COUNT) {
    throw new ValidationError(`a showcase holds at most ${SHOWCASE_SLOT_COUNT} achievements`)
  }

  const seen = new Set<string>()
  for (const it of items) {
    if (seen.has(it.achievementKey)) throw new ValidationError('duplicate showcase achievement')
    seen.add(it.achievementKey)
  }

  const ownedAchievements = new Set(
    (
      await db
        .select({ key: userAchievement.key })
        .from(userAchievement)
        .where(
          and(
            eq(userAchievement.userId, opts.userId),
            or(eq(userAchievement.competitionId, opts.competitionId), isNull(userAchievement.competitionId)),
          ),
        )
    ).map((r) => r.key),
  )
  for (const it of items) {
    if (!ownedAchievements.has(it.achievementKey)) {
      throw new ValidationError(`cannot pin an unearned achievement: ${it.achievementKey}`)
    }
  }

  return db.transaction(async (tx) => {
    await tx
      .delete(showcasePin)
      .where(and(eq(showcasePin.userId, opts.userId), eq(showcasePin.competitionId, opts.competitionId)))
    if (items.length > 0) {
      await tx.insert(showcasePin).values(
        items.map((it, i) => ({
          userId: opts.userId,
          competitionId: opts.competitionId,
          achievementKey: it.achievementKey,
          slot: i,
        })),
      )
    }
    const pins = await tx
      .select()
      .from(showcasePin)
      .where(and(eq(showcasePin.userId, opts.userId), eq(showcasePin.competitionId, opts.competitionId)))
      .orderBy(showcasePin.slot)
    return pins.map((p) => ({ slot: p.slot, achievementKey: p.achievementKey }))
  })
}
