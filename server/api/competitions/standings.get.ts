import { and, eq } from 'drizzle-orm'
import { db } from '../../../db'
import { match } from '../../../db/app-schema'
import { resolveCompetition } from '../../utils/competitions/store'
import { computeAllGroupStandings } from '../../utils/stats/standings'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { groups: [] }
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
    .where(and(eq(match.competitionId, competition.id), eq(match.stage, 'GROUP')))
  // includeLive: the table tracks in-progress matches at their live scoreline,
  // matching the provisional table the match detail view shows.
  return { groups: computeAllGroupStandings(rows, { includeLive: true }) }
})

defineRouteMeta({
  openAPI: {
    tags: ['Competitions'],
    summary: 'Group standings',
    description: 'Every group-stage table for the competition (provisional: in-progress matches count live). Empty for knockout-only tournaments.',
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
      '200': { description: 'Standings grouped by group letter.' },
    },
  },
})
