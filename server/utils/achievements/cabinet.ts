import { and, eq, isNull, or } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competitionAward, fridgePin, user, userAchievement } from '../../../db/schema'
import {
  type CabinetDto,
  COMPETITION_AWARD_TYPES,
  type FridgePinDto,
  type FridgePinInput,
  FRIDGE_SLOT_COUNT,
} from '#shared/types/achievements'
import { NotFoundError, ValidationError } from '../errors'
import { ALL_ACHIEVEMENTS } from './catalog'

// The trophies + achievements + fridge for one user in one competition. Global
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

  const achievements = ALL_ACHIEVEMENTS.flatMap((def) => {
    const e = earnedByKey.get(def.key)
    const earned = e ? { tier: e.tier, progress: e.progress, unlockedAt: e.unlockedAt.toISOString() } : null
    if (def.hidden && !earned) return []
    return [{ key: def.key, category: def.category, scope: def.scope, hidden: !!def.hidden, tiers: def.tiers, earned }]
  })

  const pins = await db
    .select()
    .from(fridgePin)
    .where(and(eq(fridgePin.userId, opts.userId), eq(fridgePin.competitionId, opts.competitionId)))
    .orderBy(fridgePin.slot)
  const fridge: FridgePinDto[] = pins.map((p) => ({ slot: p.slot, itemType: p.itemType, itemKey: p.itemKey }))

  return {
    userId: opts.userId,
    displayName: profile.name,
    isOwner: opts.viewerId === opts.userId,
    trophies,
    achievements,
    fridge,
  }
}

// Replace a user's fridge for a competition with the given ordered items. Every
// item must be one the user has actually earned (no pinning aspirational
// trophies), capped at FRIDGE_SLOT_COUNT, no duplicates. Array order = slot order.
export async function setFridge(
  db: AppDatabase,
  opts: { competitionId: string; userId: string; items: FridgePinInput[] },
): Promise<FridgePinDto[]> {
  const { items } = opts
  if (items.length > FRIDGE_SLOT_COUNT) throw new ValidationError(`a fridge holds at most ${FRIDGE_SLOT_COUNT} items`)

  const seen = new Set<string>()
  for (const it of items) {
    const k = `${it.itemType}:${it.itemKey}`
    if (seen.has(k)) throw new ValidationError('duplicate fridge item')
    seen.add(k)
  }

  const ownedTrophies = new Set(
    (
      await db
        .select({ type: competitionAward.type })
        .from(competitionAward)
        .where(and(eq(competitionAward.competitionId, opts.competitionId), eq(competitionAward.userId, opts.userId)))
    ).map((r) => r.type as string),
  )
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
    const owned = it.itemType === 'TROPHY' ? ownedTrophies.has(it.itemKey) : ownedAchievements.has(it.itemKey)
    if (!owned) throw new ValidationError(`cannot pin an unearned item: ${it.itemType} ${it.itemKey}`)
  }

  return db.transaction(async (tx) => {
    await tx
      .delete(fridgePin)
      .where(and(eq(fridgePin.userId, opts.userId), eq(fridgePin.competitionId, opts.competitionId)))
    if (items.length > 0) {
      await tx.insert(fridgePin).values(
        items.map((it, i) => ({
          userId: opts.userId,
          competitionId: opts.competitionId,
          itemType: it.itemType,
          itemKey: it.itemKey,
          slot: i,
        })),
      )
    }
    const pins = await tx
      .select()
      .from(fridgePin)
      .where(and(eq(fridgePin.userId, opts.userId), eq(fridgePin.competitionId, opts.competitionId)))
      .orderBy(fridgePin.slot)
    return pins.map((p) => ({ slot: p.slot, itemType: p.itemType, itemKey: p.itemKey }))
  })
}
