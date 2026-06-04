import { db } from '../../../db'
import { getLeaderboard } from '../../utils/leaderboard/service'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = query.limit ? Math.min(Number(query.limit), 200) : 100
  const offset = query.offset ? Math.max(Number(query.offset), 0) : 0
  return { rows: await getLeaderboard(db, { limit, offset }) }
})
