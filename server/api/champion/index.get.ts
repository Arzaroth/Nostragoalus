import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'
import { getChampionLockTime, getMyChampionPick, listCompetitionTeams } from '../../utils/champion/service'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { competition: null, teams: [], myPick: null, locked: true }

  const [teams, myPick, lock] = await Promise.all([
    listCompetitionTeams(db, competition.id),
    getMyChampionPick(db, user.id, competition.id),
    getChampionLockTime(db, competition.id),
  ])

  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    teams,
    myPick,
    locked: !!lock && Date.now() >= new Date(lock).getTime(),
  }
})
