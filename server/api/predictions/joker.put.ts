import { db } from '../../../db'
import { setJoker } from '../../utils/predictions/service'
import { requireUser } from '../../utils/auth-guards'
import { toHttpError } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  try {
    await setJoker(db, { userId: user.id, matchId: String(body?.matchId), isJoker: Boolean(body?.isJoker) })
    return { ok: true }
  } catch (error) {
    throw toHttpError(error)
  }
})
