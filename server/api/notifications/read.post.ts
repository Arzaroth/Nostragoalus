import { z } from 'zod'
import { db } from '../../../db'
import { markAllRead, markRead } from '../../utils/notifications/service'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z
  .object({
    ids: z.array(z.string()).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((b) => b.all === true || (b.ids !== undefined && b.ids.length > 0), {
    message: 'Provide a non-empty ids array or all:true',
  })

export default defineValidatedHandler({ body: bodySchema }, async ({ body, user }) => {
  const marked = body.all ? await markAllRead(db, user.id) : await markRead(db, user.id, body.ids ?? [])
  return { marked }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Notifications"
    ],
    "summary": "Mark notifications read",
    "description": "Mark the given notification ids read, or all of the user's unread notifications with `all: true`. Scoped to the owner; already-read rows are skipped.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "ids": {
                "type": "array",
                "items": {
                  "type": "string"
                },
                "description": "Notification ids to mark read (max 200)."
              },
              "all": {
                "type": "boolean",
                "description": "Mark every unread notification read."
              }
            }
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Number of notifications that transitioned to read."
      },
      "401": {
        "description": "Not signed in."
      },
      "422": {
        "description": "Neither ids nor all provided."
      }
    }
  },
})
