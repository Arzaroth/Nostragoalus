import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { db } from '../../../db'
import { bestScorerPick, competition as competitionTable } from '../../../db/schema'
import { resolveCompetition } from '../../utils/competitions/store'
import { getChampionLockTime, listCompetitionTeams } from '../../utils/champion/service'
import { getMyBestScorerPick } from '../../utils/bestscorer/service'
import { getSecondChanceWindow, isSecondChanceOpen } from '../../utils/picks/window'
import { defineReadHandler } from '../../utils/read-handler'
import { getScoringConfigFor } from '../../utils/scoring/store'

const competitionCols = createSelectSchema(competitionTable)
const querySchema = z.object({ competition: z.string().optional() })
const responseSchema = z.object({
  competition: z.object({ id: z.string(), slug: z.string(), name: z.string() }).nullable(),
  // Absent on the no-competition early return, present otherwise.
  provider: competitionCols.shape.provider.optional(),
  season: competitionCols.shape.seasonHint.optional(),
  bonus: z.number(),
  teams: z.array(z.object({ code: z.string(), name: z.string() })),
  myPick: createSelectSchema(bestScorerPick).nullable(),
  locked: z.boolean(),
  secondChance: z.object({ open: z.boolean(), closesAt: z.string().nullable() }),
})

export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ user, query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) return { competition: null, teams: [], myPick: null, locked: true, bonus: 0, secondChance: { open: false, closesAt: null } }

  const [teams, myPick, lock, window, config] = await Promise.all([
    listCompetitionTeams(db, competition.id),
    getMyBestScorerPick(db, user.id, competition.id),
    getChampionLockTime(db, competition.id),
    getSecondChanceWindow(db, competition.id),
    getScoringConfigFor(db, competition.id),
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
