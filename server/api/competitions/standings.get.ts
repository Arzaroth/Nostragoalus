import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { computeAllGroupStandings, selectGroupStandingsRows } from '../../utils/stats/standings'
import { tiebreakersForCompetition } from '../../utils/stats/tiebreakers'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { groups: [] }
  const rows = await selectGroupStandingsRows(db, competition.id)
  // includeLive: the table tracks in-progress matches at their live scoreline,
  // matching the provisional table the match detail view shows.
  const tb = tiebreakersForCompetition(competition.slug)
  return { groups: computeAllGroupStandings(rows, { includeLive: true, tiebreakers: tb.withinGroup }) }
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
