import { requireAdmin } from '../../utils/auth-guards'

const TASK_NAMES: Record<string, string> = {
  fixtures: 'fixtures:refresh',
  live: 'scores:poll',
  finalize: 'matches:finalize',
  odds: 'odds:refresh',
  'odds-backfill': 'odds:backfill',
}

// The odds tasks sit behind a 5s/call rate limiter and can run for minutes -
// longer than typical proxy timeouts. They are fired without awaiting; the
// admin page's task tooltips (recordTaskRun) show completion and the result.
const FIRE_AND_FORGET = new Set(['odds:refresh', 'odds:backfill'])

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody(event)
  const name = TASK_NAMES[String(body?.task)]
  if (!name) throw createError({ statusCode: 400, statusMessage: 'unknown task' })

  // Manual triggers run even when the cron loop is disabled.
  if (FIRE_AND_FORGET.has(name)) {
    void runTask(name, { payload: { force: true } }).catch(() => {})
    return { task: name, result: { started: true } }
  }
  const { result } = await runTask(name, { payload: { force: true } })
  return { task: name, result }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Run a data task",
    "description": "Internal: trigger fixtures refresh, live poll or finalize on demand.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "task": {
                "type": "string",
                "enum": [
                  "fixtures",
                  "live",
                  "finalize",
                  "odds",
                  "odds-backfill"
                ]
              }
            },
            "required": [
              "task"
            ]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Task result."
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
