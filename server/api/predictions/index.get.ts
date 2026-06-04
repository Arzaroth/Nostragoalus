import { db } from '../../../db'
import { getMyPredictions } from '../../utils/predictions/service'
import { requireUser } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { predictions: await getMyPredictions(db, user.id) }
})
