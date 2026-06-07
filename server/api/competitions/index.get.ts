import { db } from '../../../db'
import { listActiveCompetitions } from '../../utils/competitions/store'

export default defineEventHandler(async () => {
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
