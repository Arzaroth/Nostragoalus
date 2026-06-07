import { db } from '../../../db'
import { getMyPredictions } from '../../utils/predictions/service'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const competition = await resolveCompetition(db, (getQuery(event).competition as string) || null)
  return { predictions: await getMyPredictions(db, user.id, competition?.id) }
})
