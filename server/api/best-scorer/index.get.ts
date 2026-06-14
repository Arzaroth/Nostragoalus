import { db } from '../../../db'
import { requireUser } from '../../utils/auth-guards'
import { resolveCompetition } from '../../utils/competitions/store'
import { getChampionLockTime, listCompetitionTeams } from '../../utils/champion/service'
import { getMyBestScorerPick } from '../../utils/bestscorer/service'
import { getSecondChanceWindow, isSecondChanceOpen } from '../../utils/picks/window'
import { getActiveScoringConfig } from '../../utils/scoring/store'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const query = getQuery(event)
  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) return { competition: null, teams: [], myPick: null, locked: true, bonus: 0, secondChance: { open: false, closesAt: null } }

  const [teams, myPick, lock, window, config] = await Promise.all([
    listCompetitionTeams(db, competition.id),
    getMyBestScorerPick(db, user.id, competition.id),
    getChampionLockTime(db, competition.id),
    getSecondChanceWindow(db, competition.id),
    getActiveScoringConfig(db),
  ])

  return {
    competition: { id: competition.id, slug: competition.slug, name: competition.name },
    // Player-headshot source: FIFA vs UEFA picture CDN keyed by the fixtures
    // provider, with the season for the UEFA path.
    provider: competition.provider,
    season: competition.seasonHint,
    // Flat points a winning best-scorer pick pays (shown under the selection).
    bonus: config.rules.bestScorerBonus,
    teams,
    myPick,
    locked: !!lock && Date.now() >= new Date(lock).getTime(),
    secondChance: { open: isSecondChanceOpen(window), closesAt: window.end ? window.end.toISOString() : null },
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Predictions"
    ],
    "summary": "My best-scorer pick",
    "description": "The Golden Boot pick and whether it is still editable (locks at the first kickoff).",
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
        "description": "Best-scorer pick state."
      },
      "401": {
        "description": "Not signed in."
      }
    }
  },
})
