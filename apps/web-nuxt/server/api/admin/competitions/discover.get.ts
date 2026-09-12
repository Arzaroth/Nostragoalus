import { z } from 'zod'
import { defineReadHandler } from '../../../utils/read-handler'
import { discoverForProvider, DISCOVERABLE_PROVIDERS } from '../../../utils/competitions/discovery'

const querySchema = z.object({ provider: z.enum(DISCOVERABLE_PROVIDERS) })

const responseSchema = z.object({
  competitions: z.array(
    z.object({
      externalCompetitionId: z.string(),
      name: z.string(),
      seasonHint: z.string().nullable(),
      isTournament: z.boolean().nullable(),
    }),
  ),
})

export default defineReadHandler({ response: responseSchema, auth: 'admin', query: querySchema }, async ({ query }) => {
  return { competitions: await discoverForProvider(query.provider) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Admin (internal)"
    ],
    "summary": "List the competitions a provider carries",
    "description": "The provider's own catalog, for the add-a-competition flow. Cached briefly in memory: ESPN's catalog is ~218 entries and each costs a request to name. isTournament is the provider's own claim and gates nothing - probe the fixtures before trusting any entry.",
    "responses": {
      "200": { "description": "{ competitions: [{ externalCompetitionId, name, seasonHint, isTournament }] }." },
      "403": { "description": "Not an admin." },
      "422": { "description": "Unknown or non-enumerable provider." },
      "502": { "description": "The provider's catalog could not be read." }
    }
  },
})
