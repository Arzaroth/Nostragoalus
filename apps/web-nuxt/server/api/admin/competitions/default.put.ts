import { z } from 'zod'
import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { getDefaultCompetitionSlug, setDefaultCompetitionSlug } from '../../../utils/competitions/store'

const bodySchema = z.object({ competition: z.string().min(1) })
const responseSchema = z.object({ defaultSlug: z.string() })

export default defineValidatedHandler({ admin: true, body: bodySchema, response: responseSchema }, async ({ body }) => {
  await setDefaultCompetitionSlug(db, body.competition)
  return { defaultSlug: await getDefaultCompetitionSlug(db) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Set the default competition",
    "description": "The competition a slug-less context lands on: the \"/\" redirect, a first visit with no cookie, and the deep link of a notification that carries no competition. Must name an active competition; archiving that competition silently reverts the default to the newest active season.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "competition": { "type": "string", "description": "Competition slug." }
            },
            "required": ["competition"]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "{ defaultSlug } as resolved after the write."
      },
      "403": {
        "description": "Not an admin."
      },
      "404": {
        "description": "Unknown or archived competition."
      },
      "422": {
        "description": "Invalid payload."
      }
    }
  },
})
