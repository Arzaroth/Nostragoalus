import { z } from 'zod'
import { db } from '../../../db'
import { GLOBAL_ROOM } from '../../../shared/types/chat'
import { markRoomRead } from '../../utils/chat/unread'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  leagueId: z.string().min(1),
  // A real room key is the match thread's matchId (a uuid) or the global sentinel;
  // constrain to those so junk keys can't accrue dead rows in chat_room_read.
  roomKey: z.union([z.literal(GLOBAL_ROOM), z.string().uuid()]),
})

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  await markRoomRead(db, user.id, { leagueId: body.leagueId, roomKey: body.roomKey })
  return { ok: true }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Mark a chat room read',
    description:
      "Marks one room (matchId, or '__global__' for the league room) read up to now for the signed-in user, and clears that room's unread @mention notifications. Members only.",
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['leagueId', 'roomKey'],
            properties: {
              leagueId: { type: 'string' },
              roomKey: { type: 'string', description: "matchId or '__global__'." },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: '{ ok: true }.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Not a league member.' },
    },
  },
})
