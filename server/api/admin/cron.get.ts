import { db } from '../../../db'
import { taskRun } from '../../../db/schema'
import { requireAdmin } from '../../utils/auth-guards'
import { buildCronTaskRows } from '../../utils/tasks/cron-status'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const runs = await db.select().from(taskRun)
  return { tasks: buildCronTaskRows(runs, new Date()) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Scheduled task status",
    "description": "Internal: each background task with its schedule, next/previous run, execution count, last result/error and current status.",
    "responses": {
      "200": {
        "description": "Cron task rows."
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
