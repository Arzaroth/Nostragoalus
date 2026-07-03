import { db } from '../../../../db'
import { isAdmin, requireUser } from '../../../utils/auth-guards'
import { resolveLeagueView } from '../../../utils/leagues/service'
import { getRewardStandings } from '../../../utils/rewards/service'
import { toHttpError } from '../../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  try {
    // Same visibility as the league detail: members always, public leagues for
    // anyone signed in, admins for moderation.
    await resolveLeagueView(db, id, user.id, { resolveAdmin: () => isAdmin(event) })
    return await getRewardStandings(db, id, user.id)
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Leagues'],
    summary: 'League prizes and standings',
    description:
      "Each of the five criteria: its configured prize (if any), the member currently leading it (live, settles at competition end), and whether you hold it.",
    responses: {
      '200': { description: 'Reward standings.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown league, or a private league the caller is not in.' },
    },
  },
})
