import { z } from 'zod'
import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { defineReadHandler } from '../../utils/read-handler'
import { computeAllGroupStandings, selectGroupStandingsRows } from '../../utils/stats/standings'
import { tiebreakersForCompetition } from '../../utils/stats/tiebreakers'

const querySchema = z.object({ competition: z.string().optional() })

// One row of a group table (StandingRow in server/utils/stats/standings.ts).
const standingRowSchema = z.object({
  code: z.string().nullable(),
  name: z.string(),
  played: z.number(),
  won: z.number(),
  drawn: z.number(),
  lost: z.number(),
  gf: z.number(),
  ga: z.number(),
  gd: z.number(),
  points: z.number(),
})
const responseSchema = z.object({
  groups: z.array(z.object({ group: z.string(), rows: z.array(standingRowSchema) })),
})

export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
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
