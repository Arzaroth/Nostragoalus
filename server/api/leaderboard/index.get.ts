import { db } from '../../../db'
import { getLeaderboard } from '../../utils/leaderboard/service'
import { resolveCompetition } from '../../utils/competitions/store'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { competition: null, rows: [] }

  const limit = query.limit ? Math.min(Number(query.limit), 200) : 100
  const offset = query.offset ? Math.max(Number(query.offset), 0) : 0
  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    rows: await getLeaderboard(db, { competitionId: competition.id, limit, offset }),
  }
})
