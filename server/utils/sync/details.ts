import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { goalEvent, match } from '../../../db/schema'
import type { MatchDataProvider } from '../providers/types'

export interface DetailsSyncResult {
  fetched: number
  goals: number
  skipped: number
}

// Pull per-match detail (goals + possession) for finished matches not yet detailed.
// Idempotent: a match's goal events are replaced on each fetch. Bounded per run.
export async function syncMatchDetails(
  db: AppDatabase,
  competitionId: string,
  provider: MatchDataProvider,
  limit = 20,
): Promise<DetailsSyncResult> {
  const result: DetailsSyncResult = { fetched: 0, goals: 0, skipped: 0 }
  if (!provider.getMatchDetail) return result

  const due = await db
    .select()
    .from(match)
    .where(
      and(
        eq(match.competitionId, competitionId),
        eq(match.status, 'FINISHED'),
        isNull(match.detailsFetchedAt),
        isNotNull(match.providerStageId),
      ),
    )
    .limit(limit)

  for (const m of due) {
    try {
      const detail = await provider.getMatchDetail({ stageId: m.providerStageId as string, matchId: m.providerMatchId })
      if (!detail) {
        result.skipped += 1
        continue
      }

      await db.delete(goalEvent).where(eq(goalEvent.matchId, m.id))
      if (detail.goals.length > 0) {
        await db.insert(goalEvent).values(
          detail.goals.map((g) => ({
            matchId: m.id,
            competitionId,
            side: g.side,
            teamId: g.teamId,
            teamName: g.teamName,
            teamCode: g.teamCode,
            playerId: g.playerId,
            playerName: g.playerName,
            minute: g.minute,
            goalType: g.goalType,
            ownGoal: g.ownGoal,
            assistPlayerId: g.assistPlayerId,
            assistPlayerName: g.assistPlayerName,
          })),
        )
      }

      await db
        .update(match)
        .set({
          possessionHome: detail.possessionHome != null ? String(detail.possessionHome) : null,
          possessionAway: detail.possessionAway != null ? String(detail.possessionAway) : null,
          detailsFetchedAt: new Date(),
        })
        .where(eq(match.id, m.id))

      result.fetched += 1
      result.goals += detail.goals.length
    } catch {
      result.skipped += 1
    }
  }

  return result
}
