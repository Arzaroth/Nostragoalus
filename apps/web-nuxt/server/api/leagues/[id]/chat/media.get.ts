import { z } from 'zod'
import { db } from '../../../../../db'
import { listRoomMedia } from '../../../../utils/chat/attachments'
import { defineReadHandler } from '../../../../utils/read-handler'
import type { ChatMediaItemDTO } from '../../../../../shared/types/chat'

const querySchema = z.object({ matchId: z.string().optional() })
const responseSchema = z.object({
  media: z.array(z.object({
    messageId: z.string(),
    idx: z.number(),
    epoch: z.number(),
    createdAt: z.string(),
  })),
})

// Every image in one room (matchId omitted = league-global room), newest first,
// for the media gallery. Members only (service enforces); the ciphertext itself is
// fetched per image on demand and decrypted on the client.
export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ event, user, query }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const rows = await listRoomMedia(db, {
    leagueId,
    userId: user.id,
    matchId: typeof query.matchId === 'string' ? query.matchId : null,
  })
  const media: ChatMediaItemDTO[] = rows.map((r) => ({
    messageId: r.messageId,
    idx: r.idx,
    epoch: r.epoch,
    createdAt: r.createdAt.toISOString(),
  }))
  return { media }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'List a room\'s chat images',
    description: 'Members only. Image descriptors (messageId, idx, epoch) for the league room (or a match thread with ?matchId=), newest first. The ciphertext is fetched per image and decrypted on the client.',
    parameters: [
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
      { in: 'query', name: 'matchId', required: false, schema: { type: 'string' } },
    ],
    responses: { '200': { description: '{ media: ChatMediaItemDTO[] }.' }, '403': { description: 'Not a member.' } },
  },
})
