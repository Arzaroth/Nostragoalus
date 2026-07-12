import { z } from 'zod'
import { db } from '../../../db'
import { taskRun } from '../../../db/schema'
import { defineReadHandler } from '../../utils/read-handler'
import { buildCronTaskRows } from '../../utils/tasks/cron-status'

// Mirrors CronTaskRow (server/utils/tasks/cron-status.ts): one registry task
// joined with its persisted run history (timestamps already ISO strings).
const cronTaskRowSchema = z.object({
  name: z.string(),
  schedule: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  previousRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  lastFailureAt: z.string().nullable(),
  lastDurationMs: z.number().nullable(),
  executions: z.number(),
  lastResult: z.string().nullable(),
  lastError: z.string().nullable(),
  status: z.enum(['ok', 'failed', 'never']),
})
const responseSchema = z.object({ tasks: z.array(cronTaskRowSchema) })

export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async () => {
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
