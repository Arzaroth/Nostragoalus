import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { getUnreadRooms } from '../../utils/chat/unread'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
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
