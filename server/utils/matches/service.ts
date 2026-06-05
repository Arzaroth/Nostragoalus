import { and, asc, eq, or, type SQL } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction, round } from '../../../db/schema'
import type { AppStage, MatchStatus } from '../../../shared/types/match'

export interface MatchFilters {
  competitionId: string
  stage?: AppStage
  status?: MatchStatus
  matchday?: number
}

const matchColumns = {
  id: match.id,
  competitionId: match.competitionId,
  stage: match.stage,
  group: match.groupName,
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  homeTeamCode: match.homeTeamCode,
  awayTeamCode: match.awayTeamCode,
  kickoffTime: match.kickoffTime,
  status: match.status,
  fullTimeHome: match.fullTimeHome,
  fullTimeAway: match.fullTimeAway,
  winner: match.winner,
  scoringState: match.scoringState,
  roundId: match.roundId,
  roundLabel: round.label,
  matchday: round.matchday,
  roundSortOrder: round.sortOrder,
}

export async function listMatches(db: AppDatabase, filters: MatchFilters) {
  const conditions: SQL[] = [eq(match.competitionId, filters.competitionId)]
  if (filters.stage) conditions.push(eq(match.stage, filters.stage))
  if (filters.status) conditions.push(eq(match.status, filters.status))
  if (filters.matchday !== undefined) conditions.push(eq(round.matchday, filters.matchday))

  return db
    .select(matchColumns)
    .from(match)
    .innerJoin(round, eq(match.roundId, round.id))
    .where(and(...conditions))
    .orderBy(asc(match.kickoffTime))
}

export async function getTeamMatches(db: AppDatabase, competitionId: string, teamCode: string) {
  return db
    .select(matchColumns)
    .from(match)
    .innerJoin(round, eq(match.roundId, round.id))
    .where(
      and(
        eq(match.competitionId, competitionId),
        or(eq(match.homeTeamCode, teamCode), eq(match.awayTeamCode, teamCode)),
      ),
    )
    .orderBy(asc(match.kickoffTime))
}

export async function getMatchDetail(db: AppDatabase, matchId: string, userId?: string) {
  const rows = await db
    .select(matchColumns)
    .from(match)
    .innerJoin(round, eq(match.roundId, round.id))
    .where(eq(match.id, matchId))
    .limit(1)
  if (rows.length === 0) return null

  let myPrediction = null
  if (userId) {
    const preds = await db
      .select()
      .from(prediction)
      .where(and(eq(prediction.matchId, matchId), eq(prediction.userId, userId)))
      .limit(1)
    myPrediction = preds[0] ?? null
  }

  return { match: rows[0], myPrediction }
}
