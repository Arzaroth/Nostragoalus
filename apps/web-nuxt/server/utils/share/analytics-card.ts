import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { user } from '../../../db/schema'
import { getAnalytics } from '../analytics/service'
import { NotFoundError } from '../errors'

// The headline numbers a personal-analytics (bias detector) card brags about,
// distilled from the full analytics report for one user in one competition. Like
// the analytics page itself, it is NOT gated on the final: hasData is false until
// the user has a scored pick (the card route 404s on that, as Wrapped does
// pre-final). A plain interface so the template stays a pure function.
export interface AnalyticsCardData {
  displayName: string
  competitionName: string
  hasData: boolean
  // accuracy and exact rate as whole percents; goal lean signed (one decimal in
  // the template); home bias in signed percentage points.
  accuracyPct: number
  exactPct: number
  goalLean: number
  homeBiasPct: number
}

export async function getAnalyticsCard(
  db: AppDatabase,
  opts: { competitionId: string; userId: string },
): Promise<AnalyticsCardData> {
  const [profile] = await db.select({ name: user.name }).from(user).where(eq(user.id, opts.userId)).limit(1)
  if (!profile) throw new NotFoundError('user not found')
  const a = await getAnalytics(db, { competitionId: opts.competitionId, userId: opts.userId })
  return {
    displayName: profile.name,
    competitionName: a.competitionName,
    hasData: a.hasData,
    accuracyPct: Math.round(a.accuracy * 100),
    exactPct: Math.round(a.exactRate * 100),
    goalLean: a.goals.lean,
    homeBiasPct: a.outcomeLean.homeBiasPct,
  }
}
