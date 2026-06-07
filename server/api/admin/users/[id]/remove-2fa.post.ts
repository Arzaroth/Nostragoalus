import { db } from '../../../../../db'
import { requireAdmin } from '../../../../utils/auth-guards'
import { removeTwoFactor } from '../../../../utils/admin/twofactor'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const id = getRouterParam(event, 'id') as string
  await removeTwoFactor(db, id)
  return { ok: true }
})
