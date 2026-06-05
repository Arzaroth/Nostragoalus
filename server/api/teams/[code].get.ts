import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { getTeamMatches } from '../../utils/matches/service'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') as string
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { team: null, matches: [] }

  const matches = await getTeamMatches(db, competition.id, code)
  let name = code
  for (const m of matches) {
    if (m.homeTeamCode === code) {
      name = m.homeTeam
      break
    }
    if (m.awayTeamCode === code) {
      name = m.awayTeam
      break
    }
  }

  return { team: { code, name, competition: competition.slug }, matches }
})
