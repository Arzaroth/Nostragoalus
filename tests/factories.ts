import type { AppDatabase } from '../db/types'
import { match, prediction, user } from '../db/schema'
import type { AppStage, MatchStatus } from '../shared/types/match'

export async function makeUser(db: AppDatabase, id: string, name = id): Promise<string> {
  await db.insert(user).values({ id, name, email: `${id}@example.com`, emailVerified: false })
  return id
}

export interface MatchOptions {
  roundId: string
  kickoffTime: Date
  providerMatchId?: string
  stage?: AppStage
  status?: MatchStatus
  fullTimeHome?: number | null
  fullTimeAway?: number | null
}

export async function makeMatch(db: AppDatabase, opts: MatchOptions): Promise<string> {
  const [row] = await db
    .insert(match)
    .values({
      providerMatchId: opts.providerMatchId ?? `prov-${crypto.randomUUID()}`,
      roundId: opts.roundId,
      stage: opts.stage ?? 'GROUP',
      homeTeam: 'Home',
      awayTeam: 'Away',
      kickoffTime: opts.kickoffTime,
      status: opts.status ?? 'SCHEDULED',
      fullTimeHome: opts.fullTimeHome ?? null,
      fullTimeAway: opts.fullTimeAway ?? null,
    })
    .returning({ id: match.id })
  return row.id
}

export interface PredictionOptions {
  userId: string
  matchId: string
  roundId: string
  home: number
  away: number
  isJoker?: boolean
  lockedAt?: Date | null
}

export async function makePrediction(db: AppDatabase, opts: PredictionOptions): Promise<string> {
  const [row] = await db
    .insert(prediction)
    .values({
      userId: opts.userId,
      matchId: opts.matchId,
      roundId: opts.roundId,
      homeGoals: opts.home,
      awayGoals: opts.away,
      isJoker: opts.isJoker ?? false,
      lockedAt: opts.lockedAt ?? null,
    })
    .returning({ id: prediction.id })
  return row.id
}
