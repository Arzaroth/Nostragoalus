import { db } from '../../../../../../db'
import { defineValidatedHandler } from '../../../../../utils/validated-handler'
import { deleteMatchMedia } from '../../../../../utils/match-media/service'

export default defineValidatedHandler({ admin: true }, async ({ event }) => {
  const mediaId = getRouterParam(event, 'mediaId') as string
  await deleteMatchMedia(db, mediaId)
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    tags: ['Admin (internal)'],
    summary: 'Remove a match watch link',
    description: 'Internal: delete one curated link by id.',
    parameters: [
      { in: 'path', name: 'id', required: true, description: 'Internal match id (UUID).', schema: { type: 'string' } },
      { in: 'path', name: 'mediaId', required: true, description: 'Watch-link id (UUID).', schema: { type: 'string' } },
    ],
    responses: {
      '200': { description: 'Deleted.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Admin session required.' },
      '404': { description: 'Unknown link.' },
    },
  },
})
