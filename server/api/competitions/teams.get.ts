import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { listCompetitionTeams } from '../../utils/champion/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { teams: [] }
  return { teams: await listCompetitionTeams(db, competition.id) }
})
