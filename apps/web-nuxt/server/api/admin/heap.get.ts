import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({
  rss: z.number(),
  heapUsed: z.number(),
  heapTotal: z.number(),
  external: z.number(),
  uptimeSec: z.number(),
  snapshot: z.object({ path: z.string(), bytes: z.number() }).nullable(),
})

// The heap dump contains every live string in the process - sessions, message
// plaintext, provider payloads. It is written inside the container and never
// returned over the wire; pull it with `docker cp` and delete it after.
async function writeHeapSnapshot(): Promise<{ path: string; bytes: number }> {
  const path = `/tmp/heap-${Date.now()}.json`
  // Bun runs the prod image, but the Node target still builds. A static import of
  // 'bun:jsc' fails to resolve under Node/rollup, so the specifier is assembled at
  // runtime to keep the bundler out of it.
  const specifier = 'bun' + ':jsc'
  try {
    const jsc = (await import(/* @vite-ignore */ specifier)) as { generateHeapSnapshot: () => unknown }
    const json = JSON.stringify(jsc.generateHeapSnapshot())
    await writeFile(path, json)
    return { path, bytes: json.length }
  } catch {
    const v8 = await import('node:v8')
    v8.writeHeapSnapshot(path)
    const { stat } = await import('node:fs/promises')
    return { path, bytes: (await stat(path)).size }
  }
}

export default defineReadHandler({ response: responseSchema, auth: 'admin' }, async ({ event }) => {
  const mem = process.memoryUsage()
  const wanted = getQuery(event).snapshot === '1'
  return {
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    uptimeSec: Math.round(process.uptime()),
    snapshot: wanted ? await writeHeapSnapshot() : null,
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Process memory',
    description:
      'Current process memory counters, and with ?snapshot=1 a heap snapshot written inside the container. Internal: diagnoses the heap growth tracked in TODO.md.',
    responses: {
      200: {
        description: 'Memory counters, plus the snapshot path when one was written.',
      },
    },
  },
})
