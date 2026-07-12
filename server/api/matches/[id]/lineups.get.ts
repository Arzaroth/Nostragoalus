import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { MatchLineups } from '#shared/types/match'
import { db } from '../../../../db'
import { match } from '../../../../db/schema'
import { providerForCompetition } from '../../../utils/providers'
import { getCompetitionById } from '../../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../../utils/sync/competition'
import { getStoredLineups, storeLineups } from '../../../utils/lineups/service'
import { defineReadHandler } from '../../../utils/read-handler'

const squadPlayerSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  shirtNumber: z.number().nullable(),
  position: z.enum(['GK', 'DF', 'MF', 'FW']).nullable(),
  captain: z.boolean(),
  pictureUrl: z.string().nullable(),
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
})
const teamLineupSchema = z.object({
  formation: z.string().nullable(),
  coach: z.string().nullable(),
  startingXI: z.array(squadPlayerSchema),
  bench: z.array(squadPlayerSchema),
})
const responseSchema = z.object({
  lineups: z.object({ available: z.boolean(), home: teamLineupSchema, away: teamLineupSchema }).nullable(),
})

// The match_lineups row is the cache (the service freezes it once final). On a
// miss, resolve the provider line-up (FIFA is the source of truth), then the
// service refines positions from Sofascore where it can and persists.
export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id') as string
  const stored = await getStoredLineups(db, id)
  if (stored.hit) return { lineups: stored.data ?? null }

  const rows = await db
    .select({ providerMatchId: match.providerMatchId, providerStageId: match.providerStageId, competitionId: match.competitionId, status: match.status, oddsEventRef: match.oddsEventRef, oddsEventSwapped: match.oddsEventSwapped })
    .from(match)
    .where(eq(match.id, id))
    .limit(1)
  if (rows.length === 0) return { lineups: null }
  const m = rows[0]
  const competition = await getCompetitionById(db, m.competitionId)
  if (!competition) return { lineups: null }
  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
  if (!provider.getMatchLineups) return { lineups: null }

  let base: MatchLineups | null
  try {
    base = await provider.getMatchLineups({ stageId: m.providerStageId ?? undefined, matchId: m.providerMatchId })
  } catch {
    return { lineups: null }
  }
  const lineups = await storeLineups(db, id, base, {
    status: m.status,
    oddsProvider: competition.oddsProvider,
    oddsEventRef: m.oddsEventRef,
    oddsEventSwapped: m.oddsEventSwapped,
  })
  return { lineups }
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
