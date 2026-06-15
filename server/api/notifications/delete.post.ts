import { db } from '../../../db'
import { deleteAllNotifications, deleteNotifications } from '../../utils/notifications/service'
import { defineValidatedHandler } from '../../utils/validated-handler'
import { idsOrAllSchema } from './_schema'

export default defineValidatedHandler({ body: idsOrAllSchema }, async ({ body, user }) => {
  const deleted = body.all ? await deleteAllNotifications(db, user.id) : await deleteNotifications(db, user.id, body.ids ?? [])
  return { deleted }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Notifications"
    ],
    "summary": "Delete notifications",
    "description": "Permanently delete the given notification ids, or all of the user's notifications with `all: true`. Scoped to the owner.",
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
                "description": "Notification ids to delete (max 200)."
              },
              "all": {
                "type": "boolean",
                "description": "Delete every notification of the user."
              }
            }
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Number of notifications deleted."
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
