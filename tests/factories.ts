import type { AppDatabase } from '../db/types'
import { competition, match, prediction, user } from '../db/schema'
import type { AppStage, MatchStatus, NormalizedMatch } from '../shared/types/match'
import { ensureRounds } from '../server/utils/sync/rounds'

export async function makeUser(db: AppDatabase, id: string, name = id): Promise<string> {
  await db.insert(user).values({ id, name, email: `${id}@example.com`, emailVerified: false })
  return id
}

export interface CompetitionOptions {
  slug?: string
  name?: string
  provider?: string
  externalCompetitionId?: string
  externalSeasonId?: string | null
  seasonHint?: string | null
  isActive?: boolean
}

export async function makeCompetition(db: AppDatabase, over: CompetitionOptions = {}): Promise<string> {
  const [row] = await db
    .insert(competition)
    .values({
      slug: over.slug ?? `comp-${crypto.randomUUID()}`,
      name: over.name ?? 'Test Cup',
      provider: over.provider ?? 'fifa',
      externalCompetitionId: over.externalCompetitionId ?? '17',
      externalSeasonId: over.externalSeasonId ?? null,
      seasonHint: over.seasonHint ?? '2026',
      isActive: over.isActive ?? true,
    })
    .returning({ id: competition.id })
  return row.id
}

// Seed a competition with the standard WC-style rounds (group MD 1-3 + R32..Final).
export async function seedCompetition(db: AppDatabase): Promise<string> {
  const competitionId = await makeCompetition(db)
  const synthetic = [
    ...[1, 2, 3].map((matchday) => ({ stage: 'GROUP', matchday })),
    ...['R32', 'R16', 'QF', 'SF', 'THIRD_PLACE', 'FINAL'].map((stage) => ({ stage, matchday: null })),
  ] as unknown as NormalizedMatch[]
  await ensureRounds(db, competitionId, synthetic)
  return competitionId
}

export interface MatchOptions {
  competitionId: string
  roundId: string
  kickoffTime: Date
  providerMatchId?: string
  stage?: AppStage
  status?: MatchStatus
  fullTimeHome?: number | null
  fullTimeAway?: number | null
  groupName?: string | null
  homeTeam?: string
  awayTeam?: string
  homeTeamCode?: string | null
  awayTeamCode?: string | null
  winner?: 'HOME' | 'AWAY' | 'DRAW' | null
}

export async function makeMatch(db: AppDatabase, opts: MatchOptions): Promise<string> {
  const [row] = await db
    .insert(match)
    .values({
      competitionId: opts.competitionId,
      providerMatchId: opts.providerMatchId ?? `prov-${crypto.randomUUID()}`,
      roundId: opts.roundId,
      stage: opts.stage ?? 'GROUP',
      groupName: opts.groupName ?? null,
      homeTeam: opts.homeTeam ?? 'Home',
      awayTeam: opts.awayTeam ?? 'Away',
      // Real-looking codes by default — predictions are rejected on TBD teams,
      // so the common case must look like a confirmed fixture.
      homeTeamCode: opts.homeTeamCode !== undefined ? opts.homeTeamCode : 'HOM',
      awayTeamCode: opts.awayTeamCode !== undefined ? opts.awayTeamCode : 'AWY',
      kickoffTime: opts.kickoffTime,
      status: opts.status ?? 'SCHEDULED',
      fullTimeHome: opts.fullTimeHome ?? null,
      fullTimeAway: opts.fullTimeAway ?? null,
      winner: opts.winner ?? null,
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
