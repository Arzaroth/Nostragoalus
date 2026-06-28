import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { countUnread, listNotifications } from '../../utils/notifications/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
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
