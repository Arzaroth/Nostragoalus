import { z } from 'zod'
import { db } from '../../../../db'
import { listMatchMedia } from '../../../utils/match-media/service'
import { defineReadHandler } from '../../../utils/read-handler'

const matchMediaItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['LIVE', 'REPLAY', 'HIGHLIGHTS']),
  url: z.string(),
  label: z.string().nullable(),
  embeddable: z.boolean(),
  sandbox: z.boolean().nullable(),
  allow: z.string().nullable(),
})
const responseSchema = z.object({ media: z.array(matchMediaItemSchema) })

export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id') as string
  return { media: await listMatchMedia(db, id) }
})

defineRouteMeta({
  openAPI: {
    tags: ['Matches'],
    summary: 'Match watch links',
    description:
      'Curated stream/replay/highlight links for a match. `embeddable` is resolved (admin override or host-whitelist default); the client filters by kind against match status.',
    parameters: [{ in: 'path', name: 'id', required: true, description: 'Internal match id (UUID).', schema: { type: 'string' } }],
    responses: { '200': { description: 'Watch links (possibly empty).' } },
  },
})
