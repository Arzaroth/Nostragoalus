import { z } from 'zod'
import { db } from '../../../db'
import { getUnreadRooms } from '../../utils/chat/unread'
import { defineReadHandler } from '../../utils/read-handler'

const chatUnreadRoomSchema = z.object({
  leagueId: z.string(),
  leagueName: z.string(),
  competitionSlug: z.string(),
  roomKey: z.string(),
  matchId: z.string().nullable(),
  homeTeam: z.string().nullable(),
  awayTeam: z.string().nullable(),
  unread: z.number(),
  mentions: z.number(),
  lastAt: z.string().nullable(),
})
const responseSchema = z.object({ rooms: z.array(chatUnreadRoomSchema) })

export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ user }) => {
  const rooms = await getUnreadRooms(db, user.id)
  return { rooms }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'My unread chat rooms',
    description:
      'Every league-global room or match thread with unread messages and/or unread @mentions for the signed-in user, across all their leagues, newest activity first. Drives the cross-league chat inbox; survives reload (recomputed from persisted read markers).',
    responses: {
      '200': { description: '{ rooms: ChatUnreadRoomDTO[] }.' },
      '401': { description: 'Not signed in.' },
    },
  },
})
