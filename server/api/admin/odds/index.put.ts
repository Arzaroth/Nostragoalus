import { db } from '../../../../db'
import { defineValidatedHandler } from '../../../utils/validated-handler'
import { getCompetitionBySlug } from '../../../utils/competitions/store'
import { setCompetitionOddsProvider, setOddsProviderSchema } from '../../../utils/odds/provider-config'
import { NotFoundError } from '../../../utils/errors'

export default defineValidatedHandler({ admin: true, body: setOddsProviderSchema }, async ({ body }) => {
  const competition = await getCompetitionBySlug(db, body.competition)
  if (!competition) throw new NotFoundError('competition not found')
  return setCompetitionOddsProvider(db, competition.id, body.provider, body.providerRef)
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "Set a competition's odds provider",
    "description": "Point a competition at an odds provider and its event ref. The next odds poll uses the new provider; nothing is rescored.",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "properties": {
              "competition": { "type": "string", "description": "Competition slug." },
              "provider": { "type": "string", "enum": ["sofascore", "betexplorer"] },
              "providerRef": { "type": "string", "nullable": true, "description": "Provider event ref; null unsets it." }
            },
            "required": ["competition", "provider", "providerRef"]
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Updated competition odds config."
      },
      "403": {
        "description": "Not an admin."
      },
      "404": {
        "description": "Unknown competition."
      },
      "422": {
        "description": "Invalid provider or payload."
      }
    }
  },
})
