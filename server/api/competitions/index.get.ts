import { db } from '../../../db'
import { listActiveCompetitions } from '../../utils/competitions/store'

export default defineEventHandler(async () => {
  const competitions = await listActiveCompetitions(db)
  return { competitions: competitions.map((c) => ({ id: c.id, slug: c.slug, name: c.name })) }
})
