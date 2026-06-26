import { db } from '../../../../../db'
import { requireUser } from '../../../../utils/auth-guards'
import { listRoomMedia } from '../../../../utils/chat/attachments'
import { toHttpError } from '../../../../utils/http'
import type { ChatMediaItemDTO } from '../../../../../shared/types/chat'

// Every image in one room (matchId omitted = league-global room), newest first,
// for the media gallery. Members only (service enforces); the ciphertext itself is
// fetched per image on demand and decrypted on the client.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const leagueId = getRouterParam(event, 'id') as string
  const q = getQuery(event)
  try {
    const rows = await listRoomMedia(db, {
      leagueId,
      userId: user.id,
      matchId: typeof q.matchId === 'string' ? q.matchId : null,
    })
    const media: ChatMediaItemDTO[] = rows.map((r) => ({
      messageId: r.messageId,
      idx: r.idx,
      epoch: r.epoch,
      createdAt: r.createdAt.toISOString(),
    }))
    return { media }
  } catch (error) {
    throw toHttpError(error)
  }
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
