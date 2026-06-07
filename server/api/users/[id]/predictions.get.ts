import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { user } from '../../../../db/schema'
import { getUserPublicPredictions } from '../../../utils/predictions/service'
import { resolveCompetition } from '../../../utils/competitions/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const rows = await db.select({ name: user.name, image: user.image }).from(user).where(eq(user.id, id)).limit(1)
  if (rows.length === 0) throw createError({ statusCode: 404, statusMessage: 'user not found' })

  const competition = await resolveCompetition(db, (getQuery(event).competition as string) || null)
  return {
    user: { id, name: rows[0].name, image: rows[0].image },
    predictions: await getUserPublicPredictions(db, id, new Date(), competition?.id),
  }
})
