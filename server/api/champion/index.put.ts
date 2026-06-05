import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'
import { setChampionPick } from '../../utils/champion/service'
import { toHttpError } from '../../utils/http'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody(event)
  const competition = await resolveCompetition(db, body?.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  try {
    await setChampionPick(db, {
      userId: user.id,
      competitionId: competition.id,
      teamCode: String(body?.teamCode),
      teamName: String(body?.teamName),
    })
    return { ok: true }
  } catch (error) {
    throw toHttpError(error)
  }
})
