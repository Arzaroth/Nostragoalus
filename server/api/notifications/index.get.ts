import { z } from 'zod'
import { db } from '../../../db'
import type { NotificationData } from '../../../shared/types/notifications'
import { countUnread, listNotifications } from '../../utils/notifications/service'
import { defineReadHandler } from '../../utils/read-handler'

// `type` is enumerated for the contract; `data` is the per-type discriminated
// union (server/../shared/types/notifications.ts) - kept as its TS type here
// (z.custom keeps the handler-return typecheck exact) rather than restated as a
// 12-arm zod union that would have to track every notification variant.
const notificationDtoSchema = z.object({
  id: z.string(),
  type: z.enum([
    'LEAGUE_JOIN',
    'LEAGUE_ROLE',
    'LEAGUE_REMOVED',
    'PICK_REMINDER',
    'MATCH_RESULT',
    'CHAMPION_RESULT',
    'BEST_SCORER_RESULT',
    'TROPHY_AWARDED',
    'ACHIEVEMENT_UNLOCKED',
    'CHAT_MENTION',
    'DM_MESSAGE',
    'VOICE_MISSED',
  ]),
  data: z.custom<NotificationData>(),
  read: z.boolean(),
  createdAt: z.string(),
})
const responseSchema = z.object({
  notifications: z.array(notificationDtoSchema),
  unreadCount: z.number(),
})

export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const query = getQuery(event)
  const limit = typeof query.limit === 'string' ? Number(query.limit) : undefined
  const beforeRaw = typeof query.before === 'string' ? new Date(query.before) : undefined
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(db, user.id, {
      limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
      before: beforeRaw && !Number.isNaN(beforeRaw.getTime()) ? beforeRaw : undefined,
      beforeId: typeof query.beforeId === 'string' ? query.beforeId : undefined,
    }),
    countUnread(db, user.id),
  ])
  return { notifications, unreadCount }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Notifications"
    ],
    "summary": "My notifications",
    "description": "The signed-in user's notifications, newest first, with the current unread count. Page back in time with `before`.",
    "parameters": [
      {
        "in": "query",
        "name": "limit",
        "required": false,
        "description": "Maximum rows to return (default 30, capped at 100).",
        "schema": {
          "type": "integer"
        }
      },
      {
        "in": "query",
        "name": "before",
        "required": false,
        "description": "ISO timestamp cursor: only notifications created strictly before it.",
        "schema": {
          "type": "string",
          "format": "date-time"
        }
      },
      {
        "in": "query",
        "name": "beforeId",
        "required": false,
        "description": "Pair with `before`: the last seen row's id, to break ties when several notifications share a timestamp.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Notification list and unread count."
      },
      "401": {
        "description": "Not signed in."
      }
    }
  },
})
