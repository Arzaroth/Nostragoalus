import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { getCompetitionBySlug } from '../../../utils/competitions/store'
import { deleteScoringConfigOverride } from '../../../utils/scoring/admin'
import { NotFoundError } from '../../../utils/errors'

export default defineValidatedHandler({ admin: true }, async ({ event }) => {
  const slug = getRouterParam(event, 'competition')
  if (!slug) throw new NotFoundError('competition not found')
  const competition = await getCompetitionBySlug(db, slug)
  if (!competition) throw new NotFoundError('competition not found')
  return deleteScoringConfigOverride(db, competition.id)
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Delete scoring override",
    "description": "Remove a competition's scoring override so it falls back to the default, then recompute its ladder.",
    "parameters": [
      {
        "in": "path",
        "name": "competition",
        "required": true,
        "description": "Competition slug.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Override removed; returns how many matches were rescored."
      },
      "403": {
        "description": "Not an admin."
      },
      "404": {
        "description": "No override for this competition."
      }
    }
  },
})
