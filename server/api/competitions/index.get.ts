import { z } from 'zod'
import { db } from '../../../db'
import { competitionRefSchema } from '../../schemas/competition'
import { listActiveCompetitions } from '../../utils/competitions/store'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({ competitions: z.array(competitionRefSchema) })

export default defineReadHandler({ response: responseSchema }, async () => {
  const competitions = await listActiveCompetitions(db)
  return { competitions: competitions.map((c) => ({ id: c.id, slug: c.slug, name: c.name })) }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Competitions"
    ],
    "summary": "List competitions",
    "description": "All active competitions, newest season first.",
    "responses": {
      "200": {
        "description": "Competition list: slug, name, season."
      }
    }
  },
})
