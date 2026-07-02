import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'
import { getWrapped } from '../../utils/wrapped/service'
import { toHttpError } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const competition = await resolveCompetition(db, (getQuery(event).competition as string) || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  try {
    return await getWrapped(db, { competitionId: competition.id, userId: user.id })
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'My Tournament Wrapped',
    description:
      'The signed-in user\'s post-final recap: totals, rank and percentile, tier breakdown, best pick and biggest miss, joker and crowd stats, rank journey, chat counts, trophies and badges. Before the final is decided the response is { ready: false }.',
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
      '200': { description: 'The wrapped recap, or { ready: false } pre-final.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown competition.' },
    },
  },
})
