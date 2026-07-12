import type { AppDatabase } from '../db/types'
import {
  competition,
  goalEvent,
  league,
  leagueMember,
  leaguePrediction,
  match,
  matchReaction,
  prediction,
  user,
} from '../db/schema'
import type { LeagueMode } from '../server/utils/leagues/modes'
import type { AppStage, MatchStatus, NormalizedMatch } from '#shared/types/match'
import type { ReactionEmoji } from '#shared/reactions'
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
  oddsProvider?: string | null
  oddsProviderRef?: string | null
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
      oddsProvider: over.oddsProvider ?? null,
      oddsProviderRef: over.oddsProviderRef ?? null,
      isActive: over.isActive ?? true,
    })
    .returning({ id: competition.id })
  return row.id
}

// Seed a competition with the standard WC-style rounds (group MD 1-3 + R32..Final).
export async function seedCompetition(db: AppDatabase, over: CompetitionOptions = {}): Promise<string> {
  const competitionId = await makeCompetition(db, over)
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
  scoringState?: 'PENDING' | 'SCORED' | 'VOID' | 'STALE'
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
      scoringState: opts.scoringState ?? 'PENDING',
    })
    .returning({ id: match.id })
  return row.id
}

export interface GoalEventOptions {
  matchId: string
  competitionId: string
  side: 'HOME' | 'AWAY'
  // "45'+2'" / "90'+3'" for added time; "12'" for open play.
  minute?: string | null
  ownGoal?: boolean
  teamName?: string
  playerName?: string
}

export async function makeGoalEvent(db: AppDatabase, opts: GoalEventOptions): Promise<void> {
  await db.insert(goalEvent).values({
    matchId: opts.matchId,
    competitionId: opts.competitionId,
    side: opts.side,
    teamName: opts.teamName ?? (opts.side === 'HOME' ? 'Home' : 'Away'),
    playerName: opts.playerName ?? 'Scorer',
    minute: opts.minute ?? null,
    ownGoal: opts.ownGoal ?? false,
  })
}

export interface LeagueOptions {
  competitionId: string
  ownerId?: string
  name?: string
  joinCode?: string
  visibility?: 'PRIVATE' | 'PUBLIC'
  mode?: LeagueMode
  lives?: number | null
}

export async function makeLeague(db: AppDatabase, opts: LeagueOptions): Promise<string> {
  const [row] = await db
    .insert(league)
    .values({
      competitionId: opts.competitionId,
      name: opts.name ?? 'Test League',
      joinCode: opts.joinCode ?? `CODE${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      visibility: opts.visibility ?? 'PRIVATE',
      mode: opts.mode ?? 'NORMAL',
      lives: opts.lives ?? null,
      createdBy: opts.ownerId ?? null,
    })
    .returning({ id: league.id })
  if (opts.ownerId) await addLeagueMember(db, row.id, opts.ownerId, 'OWNER')
  return row.id
}

export async function addLeagueMember(
  db: AppDatabase,
  leagueId: string,
  userId: string,
  role: 'OWNER' | 'MODERATOR' | 'MEMBER' = 'MEMBER',
  picksSynced = true,
): Promise<void> {
  await db.insert(leagueMember).values({ leagueId, userId, role, picksSynced })
}

export interface PredictionOptions {
  userId: string
  matchId: string
  roundId: string
  home: number
  away: number
  isJoker?: boolean
  isOutcomeOnly?: boolean
  wager?: number | null
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
      isOutcomeOnly: opts.isOutcomeOnly ?? false,
      wager: opts.wager ?? null,
      lockedAt: opts.lockedAt ?? null,
    })
    .returning({ id: prediction.id })
  return row.id
}

export interface LeaguePredictionOptions {
  leagueId: string
  userId: string
  matchId: string
  roundId: string
  home: number
  away: number
  isJoker?: boolean
  isOutcomeOnly?: boolean
  wager?: number | null
}

export async function makeLeaguePrediction(db: AppDatabase, opts: LeaguePredictionOptions): Promise<string> {
  const [row] = await db
    .insert(leaguePrediction)
    .values({
      leagueId: opts.leagueId,
      userId: opts.userId,
      matchId: opts.matchId,
      roundId: opts.roundId,
      homeGoals: opts.home,
      awayGoals: opts.away,
      isJoker: opts.isJoker ?? false,
      isOutcomeOnly: opts.isOutcomeOnly ?? false,
      wager: opts.wager ?? null,
    })
    .returning({ id: leaguePrediction.id })
  return row.id
}

export async function makeReaction(
  db: AppDatabase,
  opts: { userId: string; matchId: string; emoji: ReactionEmoji },
): Promise<void> {
  await db.insert(matchReaction).values({ userId: opts.userId, matchId: opts.matchId, emoji: opts.emoji })
}
