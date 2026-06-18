import { z } from 'zod'
import { db } from '../../../../../db'
import { addWrappedKeys } from '../../../../utils/chat/service'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

const bodySchema = z.object({
  epoch: z.number().int().positive(),
  wraps: z.array(z.object({ userId: z.string(), wrappedKey: z.string().min(1).max(1024) })).min(1).max(2000),
})

// Any keyholding member seals the group key for newcomers and uploads the wraps.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  return addWrappedKeys(db, { leagueId, actorId: user.id, epoch: body.epoch, wraps: body.wraps })
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Wrap the group key for members',
    description: 'A member holding the key seals it to newcomers at the current epoch (idempotent).',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ added }.' }, '403': { description: 'Not a member.' }, '409': { description: 'Stale epoch.' } },
  },
})
