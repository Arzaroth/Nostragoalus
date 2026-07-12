import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { db } from '../../../db'
import { championPick } from '../../../db/schema'
import { resolveCompetition } from '../../utils/competitions/store'
import { getChampionLockTime, getMyChampionPick, listCompetitionTeams } from '../../utils/champion/service'
import { getSecondChanceWindow, isSecondChanceOpen } from '../../utils/picks/window'
import { getFifaRanks } from '../../utils/champion/ranking'
import { defineReadHandler } from '../../utils/read-handler'
import { championPointsForRank } from '../../utils/scoring/config'
import { getScoringConfigFor } from '../../utils/scoring/store'

const querySchema = z.object({ competition: z.string().optional() })
const responseSchema = z.object({
  competition: z.object({ id: z.string(), slug: z.string(), name: z.string() }).nullable(),
  teams: z.array(z.object({ code: z.string(), name: z.string(), fifaRank: z.number().nullable(), potentialPoints: z.number() })),
  myPick: createSelectSchema(championPick).nullable(),
  locked: z.boolean(),
  secondChance: z.object({ open: z.boolean(), closesAt: z.string().nullable() }),
})

export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ user, query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) return { competition: null, teams: [], myPick: null, locked: true, secondChance: { open: false, closesAt: null } }

  const [teams, myPick, lock, window, ranks, config] = await Promise.all([
    listCompetitionTeams(db, competition.id),
    getMyChampionPick(db, user.id, competition.id),
    getChampionLockTime(db, competition.id),
    getSecondChanceWindow(db, competition.id),
    getFifaRanks(),
    getScoringConfigFor(db, competition.id),
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
    // Second chance: re-pick allowed (you must already have a pick) while open.
    secondChance: { open: isSecondChanceOpen(window), closesAt: window.end ? window.end.toISOString() : null },
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
