import { z } from 'zod'
import { db } from '../../../db'
import { competitionRefSchema } from '../../schemas/competition'
import { getDefaultCompetitionSlug, listActiveCompetitions } from '../../utils/competitions/store'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({ competitions: z.array(competitionRefSchema), defaultSlug: z.string() })

export default defineReadHandler({ response: responseSchema }, async () => {
  const [competitions, defaultSlug] = await Promise.all([listActiveCompetitions(db), getDefaultCompetitionSlug(db)])
  return { competitions: competitions.map((c) => ({ id: c.id, slug: c.slug, name: c.name })), defaultSlug }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Competitions"
    ],
    "summary": "List competitions",
    "description": "All active competitions, newest season first, plus the slug a slug-less context should land on (admin-set, falling back to the newest active season).",
    "responses": {
      "200": {
        "description": "{ competitions: [{ id, slug, name }], defaultSlug }."
      }
    }
  },
})
