import { db } from '../../../db'
import { upsertPrediction } from '../../utils/predictions/service'
import { requireUser } from '../../utils/auth-guards'
import { toHttpError } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  try {
    const id = await upsertPrediction(db, {
      userId: user.id,
      matchId: String(body?.matchId),
      home: Number(body?.home),
      away: Number(body?.away),
    })
    return { id }
  } catch (error) {
    throw toHttpError(error)
  }
})
