import { db } from '../../../../db'
import { getMatchInsights } from '../../../utils/stats/insights'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const insights = await getMatchInsights(db, id)
  if (!insights) throw createError({ statusCode: 404, statusMessage: 'match not found' })
  return insights
})
