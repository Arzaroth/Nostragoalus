import { db } from '../../../../db'
import { requireUser } from '../../../utils/auth-guards'
import { getPastPickCounterfactual } from '../../../utils/past-pick/service'

export default defineEventHandler(async (event) => {
  const matchId = getRouterParam(event, 'id') as string
  // Owner-only: a session is required and we only ever replay THIS user's own
  // earlier picks. No other user's history is reachable through this route.
  const user = await requireUser(event)
  return getPastPickCounterfactual(db, { matchId, userId: user.id })
})

defineRouteMeta({
  openAPI: {
    tags: ['Matches'],
    summary: 'My earlier-pick counterfactual for a match',
    description:
      "Replays the signed-in user's OWN earlier (swapped-off) score picks for this match through the scoring engine and surfaces the best one when it would have out-scored the pick they kept. Owner-only (session required) and never exposes another user's picks. Returns scope 'none' before kickoff, when no earlier pick beats the kept one, or when the kept pick is itself exact. Live matches score provisionally against the current scoreline (scope 'live'); finished matches use the final result (scope 'final'). The cheeky flag marks a winning 0-0 earlier pick.",
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        description: 'Internal match id (UUID).',
        schema: { type: 'string' },
      },
    ],
    responses: { '200': { description: "The counterfactual, or { scope: 'none' } when there is nothing to surface." } },
  },
})
