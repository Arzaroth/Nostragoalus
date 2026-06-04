import { db } from '../../../db'
import { getMatchDetail } from '../../utils/matches/service'
import { getSessionUser } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const user = await getSessionUser(event)
  const detail = await getMatchDetail(db, id, user?.id)
  if (!detail) throw createError({ statusCode: 404, statusMessage: 'match not found' })

  return { ...detail, isLocked: new Date(detail.match.kickoffTime).getTime() <= Date.now() }
})
