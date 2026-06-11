import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'
import { getChampionLockTime, getMyChampionPick, listCompetitionTeams } from '../../utils/champion/service'
import { getFifaRanks } from '../../utils/champion/ranking'
import { championPointsForRank } from '../../utils/scoring/config'
import { getActiveScoringConfig } from '../../utils/scoring/store'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { competition: null, teams: [], myPick: null, locked: true }

  const [teams, myPick, lock, ranks, config] = await Promise.all([
    listCompetitionTeams(db, competition.id),
    getMyChampionPick(db, user.id, competition.id),
    getChampionLockTime(db, competition.id),
    getFifaRanks(),
    getActiveScoringConfig(db),
  ])

  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    // Each team carries what a winning pick made right now would pay - the
    // saved pick keeps the value snapshotted when it was made (myPick).
    teams: teams.map((team) => {
      const fifaRank = ranks?.get(team.code) ?? null
      // Ranks known -> tier (absent = catch-all); fetch failed -> flat fallback.
      const potentialPoints = ranks ? championPointsForRank(fifaRank, config.rules) : config.rules.championBonus
      return { ...team, fifaRank, potentialPoints }
    }),
    myPick,
    locked: !!lock && Date.now() >= new Date(lock).getTime(),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Predictions"
    ],
    "summary": "My champion pick",
    "description": "The tournament-winner pick and whether it is still editable (locks at the first kickoff).",
    "parameters": [
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Champion pick state."
      },
      "401": {
        "description": "Not signed in."
      }
    }
  },
})
