import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { user } from '../../../../db/schema'
import { getUserPublicPredictions } from '../../../utils/predictions/service'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const rows = await db.select({ name: user.name }).from(user).where(eq(user.id, id)).limit(1)
  if (rows.length === 0) throw createError({ statusCode: 404, statusMessage: 'user not found' })

  return {
    user: { id, name: rows[0].name },
    predictions: await getUserPublicPredictions(db, id),
  }
})
