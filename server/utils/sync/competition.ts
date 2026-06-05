import type { AppDatabase } from '../../../db/types'
import type { MatchDataProvider } from '../providers/types'
import { resolveFifaSeasonId } from '../providers/fifa'
import { setExternalSeasonId } from '../competitions/store'
import { ensureRounds } from './rounds'
import { upsertMatches, type UpsertResult } from './upsert-matches'

export interface SyncCompetition {
  id: string
  provider: string
  externalCompetitionId: string
  externalSeasonId: string | null
  seasonHint: string | null
}

export type SeasonResolver = (opts: { competitionId: string; hint?: string | null }) => Promise<string>

// Resolve (and cache) the external season id. FIFA is resolved from /seasons;
// other providers don't have a season concept and return undefined.
export async function resolveCompetitionSeason(
  db: AppDatabase,
  competition: SyncCompetition,
  resolver: SeasonResolver = resolveFifaSeasonId,
): Promise<string | undefined> {
  if (competition.provider !== 'fifa') return undefined
  if (competition.externalSeasonId) return competition.externalSeasonId

  const seasonId = await resolver({ competitionId: competition.externalCompetitionId, hint: competition.seasonHint })
  await setExternalSeasonId(db, competition.id, seasonId)
  return seasonId
}

export async function syncFixtures(
  db: AppDatabase,
  competitionId: string,
  provider: MatchDataProvider,
  season: string,
): Promise<UpsertResult> {
  const matches = await provider.listFixtures({ season })
  await ensureRounds(db, competitionId, matches)
  return upsertMatches(db, competitionId, matches)
}

export async function syncLive(
  db: AppDatabase,
  competitionId: string,
  provider: MatchDataProvider,
): Promise<UpsertResult> {
  const matches = await provider.getLiveMatches()
  await ensureRounds(db, competitionId, matches)
  return upsertMatches(db, competitionId, matches)
}
