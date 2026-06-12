import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { match } from '../../../../db/schema'
import { providerForCompetition } from '../../../utils/providers'
import { getCompetitionById } from '../../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../../utils/sync/competition'

// Full-time details never change again - cache them for the process lifetime.
// Live matches refresh every minute so the clock and stats stay current.
// (Single instance: in-memory is enough.)
const cache = new Map<string, { at: number; final: boolean; detail: unknown }>()
const TTL_MS = 60 * 1000

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const cached = cache.get(id)
  if (cached && (cached.final || Date.now() - cached.at < TTL_MS)) return { detail: cached.detail }

  const rows = await db
    .select({ providerMatchId: match.providerMatchId, providerStageId: match.providerStageId, competitionId: match.competitionId, status: match.status })
    .from(match)
    .where(eq(match.id, id))
    .limit(1)
  if (rows.length === 0) return { detail: null }

  const competition = await getCompetitionById(db, rows[0].competitionId)
  if (!competition) return { detail: null }
  const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
  if (!provider.getMatchDetail) return { detail: null }

  try {
    const detail = await provider.getMatchDetail({ stageId: rows[0].providerStageId ?? undefined, matchId: rows[0].providerMatchId })
    // Enrich with the football-intelligence per-match stats when FIFA exposes them.
    let stats: { home: unknown; away: unknown } | null = null
    if (detail?.ifesId && provider.getMatchStats) {
      try {
        const byTeam = await provider.getMatchStats({ ifesId: detail.ifesId })
        if (byTeam) {
          stats = {
            home: (detail.homeTeamId && byTeam[detail.homeTeamId]) || null,
            away: (detail.awayTeamId && byTeam[detail.awayTeamId]) || null,
          }
        }
      } catch {
        // stats are a bonus - never sink the detail payload over them
      }
    }
    const enriched = detail ? { ...detail, stats } : null
    cache.set(id, { at: Date.now(), final: rows[0].status === 'FINISHED' && enriched != null, detail: enriched })
    return { detail: enriched }
  } catch {
    return { detail: null }
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "Live match detail",
    "description": "Upstream detail: goals with assists, bookings (incl. touchline cards), substitutions, attendance, venue and per-team match stats. Cached 5 minutes while live, for the process lifetime once finished.",
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
        "description": "Detail payload or null when the provider has nothing."
      }
    }
  },
})
