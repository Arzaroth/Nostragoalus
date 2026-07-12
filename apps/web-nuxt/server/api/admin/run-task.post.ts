import { z } from 'zod'
import { defineValidatedHandler } from '../../utils/validated-handler'
import { findTask } from '../../utils/tasks/registry'

const responseSchema = z.object({ task: z.string(), result: z.unknown() })

export default defineValidatedHandler({ admin: true, response: responseSchema }, async ({ event }) => {
  const body = await readBody(event)
  const task = findTask(String(body?.name))
  if (!task) throw createError({ statusCode: 400, statusMessage: 'unknown task' })

  // Manual triggers run even when the cron loop is disabled. Long, rate-limited
  // tasks (odds) are fired without awaiting; the cron view shows completion via
  // recordTaskRun on the next refresh.
  if (task.fireAndForget) {
    void runTask(task.name, { payload: { force: true } }).catch(() => {})
    return { task: task.name, result: { started: true } }
  }
  const { result } = await runTask(task.name, { payload: { force: true } })
  return { task: task.name, result }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Run a scheduled task now",
    "description": "Internal: trigger a registered background task on demand (admin cron view).",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": { "name": { "type": "string" } },
            "required": ["name"]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Task result (or { started: true } for fire-and-forget tasks)."
      },
      "400": {
        "description": "Unknown task."
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
