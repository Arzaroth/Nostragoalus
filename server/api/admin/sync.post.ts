import { requireAdmin } from '../../utils/auth-guards'

const TASK_NAMES: Record<string, string> = {
  fixtures: 'fixtures:refresh',
  live: 'scores:poll',
  finalize: 'matches:finalize',
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody(event)
  const name = TASK_NAMES[String(body?.task)]
  if (!name) throw createError({ statusCode: 400, statusMessage: 'unknown task' })

  const { result } = await runTask(name)
  return { task: name, result }
})
