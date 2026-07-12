import { z } from 'zod'
import { db } from '../../../../../../db'
import { isAdmin } from '../../../../../utils/auth-guards'
import { resolveLeagueView } from '../../../../../utils/leagues/service'
import { getRewardRanking } from '../../../../../utils/rewards/service'
import { ValidationError } from '../../../../../utils/errors'
import { defineReadHandler } from '../../../../../utils/read-handler'
import { leagueRewardDtoSchema, rewardCriterionSchema, rewardMetricSchema } from '../../../../../schemas/league'
import { LEAGUE_REWARD_CRITERIA, type LeagueRewardCriterion } from '#shared/types/rewards'

const responseSchema = z.object({
  type: rewardCriterionSchema,
  teamCode: z.string().nullable(),
  reward: leagueRewardDtoSchema.nullable(),
  metric: rewardMetricSchema,
  rows: z.array(
    z.object({
      rank: z.number(),
      userId: z.string(),
      displayName: z.string(),
      image: z.string().nullable(),
      value: z.number(),
      isViewer: z.boolean(),
    }),
  ),
})

export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  const type = getRouterParam(event, 'type')!
  if (!(LEAGUE_REWARD_CRITERIA as readonly string[]).includes(type)) {
    throw new ValidationError('unknown reward criterion')
  }
  // Same visibility as the league detail and its reward standings.
  await resolveLeagueView(db, id, user.id, { resolveAdmin: () => isAdmin(event) })
  return await getRewardRanking(db, id, type as LeagueRewardCriterion, user.id)
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
