import { db } from '../../../db'
import { listMatches } from '../../utils/matches/service'
import type { AppStage, MatchStatus } from '../../../shared/types/match'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const matches = await listMatches(db, {
    stage: (query.stage as AppStage) || undefined,
    status: (query.status as MatchStatus) || undefined,
    matchday: query.matchday ? Number(query.matchday) : undefined,
  })

  const now = Date.now()
  return {
    matches: matches.map((m) => ({ ...m, isLocked: new Date(m.kickoffTime).getTime() <= now })),
  }
})
