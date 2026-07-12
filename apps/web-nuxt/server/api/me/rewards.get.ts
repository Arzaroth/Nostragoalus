import { z } from 'zod'
import { db } from '../../../db'
import { getMyRewards } from '../../utils/rewards/service'
import { defineReadHandler } from '../../utils/read-handler'

const rewardSchema = z.object({
  type: z.string(),
  label: z.string(),
  imageUrl: z.string().nullable(),
  note: z.string().nullable(),
  link: z.string().nullable(),
})

const responseSchema = z.array(
  z.object({
    leagueId: z.string(),
    leagueName: z.string(),
    reward: rewardSchema,
    type: z.string(),
    teamCode: z.string().nullable(),
    youHold: z.boolean(),
  }),
)

export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ user }) => {
  return getMyRewards(db, user.id)
})

defineRouteMeta({
  openAPI: {
    tags: ['Leagues'],
    summary: 'Prizes you currently hold',
    description: 'Every league prize you are currently leading, across all your leagues.',
    responses: {
      '200': { description: 'The prizes you hold.' },
      '401': { description: 'Not signed in.' },
    },
  },
})
