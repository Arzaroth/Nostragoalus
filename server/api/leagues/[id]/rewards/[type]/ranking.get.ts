import { db } from '../../../../../../db'
import { isAdmin, requireUser } from '../../../../../utils/auth-guards'
import { resolveLeagueView } from '../../../../../utils/leagues/service'
import { getRewardRanking } from '../../../../../utils/rewards/service'
import { toHttpError } from '../../../../../utils/http'
import { ValidationError } from '../../../../../utils/errors'
import { COMPETITION_AWARD_TYPES } from '#shared/types/achievements'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')!
  const type = getRouterParam(event, 'type')!
  try {
    if (!(COMPETITION_AWARD_TYPES as readonly string[]).includes(type)) {
      throw new ValidationError('unknown reward criterion')
    }
    // Same visibility as the league detail and its reward standings.
    await resolveLeagueView(db, id, user.id, { resolveAdmin: () => isAdmin(event) })
    return await getRewardRanking(db, id, type as (typeof COMPETITION_AWARD_TYPES)[number], user.id)
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Leagues'],
    summary: 'A prize criterion ranking',
    description:
      'The live ranking of one award criterion among a league members: rank, member (concealed names blank), and the criterion value (points, or EXACT count for Madame IRMA). Settles at competition end.',
    responses: {
      '200': { description: 'The criterion ranking.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown league, or a private league the caller is not in.' },
      '422': { description: 'Unknown criterion.' },
    },
  },
})
