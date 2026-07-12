import { z } from 'zod'
import { db } from '../../../../../db'
import { addWrappedKeys } from '../../../../utils/chat/service'
import { publishKeysAdded } from '../../../../utils/live/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

const bodySchema = z.object({
  epoch: z.number().int().positive(),
  wraps: z.array(z.object({ userId: z.string(), wrappedKey: z.string().min(1).max(1024) })).min(1).max(2000),
})

const responseSchema = z.object({ added: z.number() })

// Any keyholding member seals the group key for newcomers and uploads the wraps.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const res = await addWrappedKeys(db, { leagueId, actorId: user.id, epoch: body.epoch, wraps: body.wraps })
  // Tell the freshly-sealed members to reload and open their new key, clearing
  // their "waiting for a key" state without a manual refresh.
  if (res.added > 0) publishKeysAdded(leagueId, body.wraps.map((w) => w.userId))
  return res
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
