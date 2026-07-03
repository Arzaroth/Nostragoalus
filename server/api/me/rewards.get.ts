import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { getMyRewards } from '../../utils/rewards/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
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
