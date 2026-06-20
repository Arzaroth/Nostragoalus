import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { match } from '../../../db/schema'
import { providerForCompetition } from '../../utils/providers'
import { orderBracketFeeders } from '../../utils/providers/bracket-order'
import { resolveCompetition } from '../../utils/competitions/store'
import { resolveCompetitionSeason } from '../../utils/sync/competition'
import { computeAllGroupStandings } from '../../utils/stats/standings'
import { projectBracket } from '../../utils/bracket/projection'
import type { NormalizedBracket } from '../../../shared/types/match'

// The provider structure is expensive and changes rarely, so it's cached. The
// projection rides the live group standings, so it's recomputed per request
// (cheap) and overlaid on the cached base - never cached itself.
const cache = new Map<string, { at: number; bracket: NormalizedBracket | null }>()
const TTL_MS = 10 * 60 * 1000

async function buildBaseBracket(competitionId: string, provider: ReturnType<typeof providerForCompetition>) {
  let bracket = await provider.getBracket!()
  if (!bracket) return null
  bracket = orderBracketFeeders(bracket)
  // Link each bracket match to our internal match id (for navigation).
  const ours = await db.select({ id: match.id, pid: match.providerMatchId }).from(match).where(eq(match.competitionId, competitionId))
  const idByProvider = new Map(ours.map((m) => [m.pid, m.id]))
  for (const round of bracket.rounds) {
    for (const m of round.matches) m.id = idByProvider.get(m.providerMatchId) ?? null
  }
  return bracket
}

async function groupStandingsFor(competitionId: string) {
  const rows = await db
    .select({
      group: match.groupName,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeTeamCode: match.homeTeamCode,
      awayTeamCode: match.awayTeamCode,
      status: match.status,
      fullTimeHome: match.fullTimeHome,
      fullTimeAway: match.fullTimeAway,
    })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), eq(match.stage, 'GROUP')))
  return computeAllGroupStandings(rows, { includeLive: true })
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { bracket: null }

  try {
    let base: NormalizedBracket | null
    const cached = cache.get(competition.id)
    if (cached && Date.now() - cached.at < TTL_MS) {
      base = cached.bracket
    } else {
      const provider = providerForCompetition(competition, await resolveCompetitionSeason(db, competition))
      base = provider.getBracket ? await buildBaseBracket(competition.id, provider) : null
      cache.set(competition.id, { at: Date.now(), bracket: base })
    }
    if (!base) return { bracket: null }
    return { bracket: projectBracket(base, await groupStandingsFor(competition.id)) }
  } catch {
    return { bracket: null }
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Competitions"
    ],
    "summary": "Knockout bracket",
    "description": "The knockout tree (rounds, feeders ordered under their parents) plus the champion once decided. Null while no knockout structure exists.",
    "parameters": [
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Bracket rounds and winner, or null."
      }
    }
  },
})
