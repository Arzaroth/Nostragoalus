import { db } from '../../../../db'
import { listMatchMedia } from '../../../utils/match-media/service'

export default defineEventHandler(async (event) => {
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
