import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { match } from '../../../../db/schema'
import { providerForCompetition } from '../../../utils/providers'
import { getCompetitionById } from '../../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../../utils/sync/competition'

const cache = new Map<string, { at: number; detail: unknown }>()
const TTL_MS = 5 * 60 * 1000

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const cached = cache.get(id)
  if (cached && Date.now() - cached.at < TTL_MS) return { detail: cached.detail }

  const rows = await db
    .select({ providerMatchId: match.providerMatchId, providerStageId: match.providerStageId, competitionId: match.competitionId })
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
        // stats are a bonus — never sink the detail payload over them
      }
    }
    const enriched = detail ? { ...detail, stats } : null
    cache.set(id, { at: Date.now(), detail: enriched })
    return { detail: enriched }
  } catch {
    return { detail: null }
  }
})
