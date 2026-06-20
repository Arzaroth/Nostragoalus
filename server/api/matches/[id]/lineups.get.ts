import { eq } from 'drizzle-orm'
import type { MatchLineups } from '#shared/types/match'
import { db } from '../../../../db'
import { match } from '../../../../db/schema'
import { providerForCompetition } from '../../../utils/providers'
import { getCompetitionById } from '../../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../../utils/sync/competition'

// Line-ups don't change once the match is final - cache them for the process
// lifetime then. While the match is upcoming/live the announced XI can still
// arrive (or subs flip the side), so refresh every minute. (Single instance:
// in-memory is enough, same as live-detail.)
const cache = new Map<string, { at: number; final: boolean; lineups: MatchLineups | null }>()
const TTL_MS = 60 * 1000

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const cached = cache.get(id)
  if (cached && (cached.final || Date.now() - cached.at < TTL_MS)) return { lineups: cached.lineups }

  const rows = await db
    .select({ providerMatchId: match.providerMatchId, providerStageId: match.providerStageId, competitionId: match.competitionId, status: match.status })
    .from(match)
    .where(eq(match.id, id))
    .limit(1)
  if (rows.length === 0) return { lineups: null }

  const competition = await getCompetitionById(db, rows[0].competitionId)
  if (!competition) return { lineups: null }
  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
  if (!provider.getMatchLineups) return { lineups: null }

  try {
    const lineups = await provider.getMatchLineups({ stageId: rows[0].providerStageId ?? undefined, matchId: rows[0].providerMatchId })
    // Only freeze the cache once the line-up is both final and actually present;
    // a finished match that answered empty should still be retried.
    const final = rows[0].status === 'FINISHED' && !!lineups?.available
    cache.set(id, { at: Date.now(), final, lineups })
    return { lineups }
  } catch {
    return { lineups: null }
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "Match line-ups",
    "description": "Starting XI and bench per team, with the formation (when the feed ships one) and head coach. Empty (available:false) until the official line-ups drop, about an hour before kickoff. Cached one minute while pending/live, for the process lifetime once finished.",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "description": "Internal match id (UUID).",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Line-ups payload, or null when the provider exposes none."
      }
    }
  },
})
