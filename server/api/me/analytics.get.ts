import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'
import { getAnalytics } from '../../utils/analytics/service'
import { toHttpError } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const competition = await resolveCompetition(db, (getQuery(event).competition as string) || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  try {
    return await getAnalytics(db, { competitionId: competition.id, userId: user.id })
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'My prediction analytics',
    description:
      "The signed-in user's prediction bias report for a competition: tier breakdown, goals over/under-prediction, home-win and draw lean, teams they over- and under-rate, accuracy by round, best call and biggest miss. Unlike Wrapped it is not gated on the final; { hasData: false } until the user has a scored pick.",
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
      '200': { description: 'The analytics report, or { hasData: false } with no scored picks.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown competition.' },
    },
  },
})
