import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { match } from '../../../db/app-schema'
import { resolveCompetition } from '../../utils/competitions/store'
import { defineReadHandler } from '../../utils/read-handler'
import { computeEliminatedTeams } from '../../utils/stats/elimination'

const querySchema = z.object({ competition: z.string().optional() })
const responseSchema = z.object({ codes: z.array(z.string()) })

// Team codes that are out of the tournament beyond any doubt (knockout losers,
// group non-qualifiers, and teams mathematically eliminated mid-group), for greying
// them on the world map. Public read - it exposes only fixture-derived facts.
export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) return { codes: [] }
  const rows = await db
    .select({
      stage: match.stage,
      group: match.groupName,
      homeTeamCode: match.homeTeamCode,
      awayTeamCode: match.awayTeamCode,
      status: match.status,
      fullTimeHome: match.fullTimeHome,
      fullTimeAway: match.fullTimeAway,
      winner: match.winner,
    })
    .from(match)
    .where(eq(match.competitionId, competition.id))
  return { codes: computeEliminatedTeams(rows, competition.slug) }
})

defineRouteMeta({
  openAPI: {
    tags: ['Competitions'],
    summary: 'Eliminated teams',
    description:
      'Team codes certainly out of the tournament: knockout losers, group non-qualifiers, and teams mathematically eliminated mid-group (per the competition’s tiebreaker rules). Empty for a competition with no decided eliminations yet.',
    parameters: [
      {
        in: 'query',
        name: 'competition',
        required: false,
        description: "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: 'Array of eliminated team codes.' },
    },
  },
})
