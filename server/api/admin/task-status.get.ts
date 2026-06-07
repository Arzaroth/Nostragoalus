import { db } from '../../../db'
import { taskRun } from '../../../db/schema'
import { requireAdmin } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { tasks: await db.select().from(taskRun) }
})
