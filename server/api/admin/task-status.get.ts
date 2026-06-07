import { db } from '../../../db'
import { taskRun } from '../../../db/schema'
import { requireAdmin } from '../../utils/auth-guards'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { tasks: await db.select().from(taskRun) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Task run history",
    "description": "Internal: last run, duration, result and last failure per scheduled task.",
    "responses": {
      "200": {
        "description": "Task run rows."
      },
      "401": {
        "description": "Not signed in."
      },
      "403": {
        "description": "Admin session required."
      }
    }
  },
})
