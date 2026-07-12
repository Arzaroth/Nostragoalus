import { z } from 'zod'
import { db } from '../../../../db'
import { isAdmin } from '../../../utils/auth-guards'
import { resolveLeagueView } from '../../../utils/leagues/service'
import { getRewardStandings } from '../../../utils/rewards/service'
import { defineReadHandler } from '../../../utils/read-handler'
import { leagueRewardDtoSchema, rewardCriterionSchema, rewardMetricSchema } from '../../../schemas/league'

const rewardStandingSchema = z.object({
  type: rewardCriterionSchema,
  reward: leagueRewardDtoSchema.nullable(),
  winners: z.array(z.object({ userId: z.string(), displayName: z.string() })),
  value: z.number(),
  metric: rewardMetricSchema,
  teamCode: z.string().nullable(),
  disabled: z.boolean(),
  youHold: z.boolean(),
})

const responseSchema = z.array(rewardStandingSchema)

export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  // Same visibility as the league detail: members always, public leagues for
  // anyone signed in, admins for moderation.
  await resolveLeagueView(db, id, user.id, { resolveAdmin: () => isAdmin(event) })
  return await getRewardStandings(db, id, user.id)
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
