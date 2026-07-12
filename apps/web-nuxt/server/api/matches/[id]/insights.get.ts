import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../../db'
import { match } from '../../../../db/schema'
import { standingRowSchema } from '../../../schemas/match'
import { getMatchInsights } from '../../../utils/stats/insights'
import { getAllTimeHeadToHead, getTeamRecentResults } from '../../../utils/stats/alltime-h2h'
import { defineReadHandler } from '../../../utils/read-handler'

const wdl = z.enum(['W', 'D', 'L'])
const formResultSchema = z.object({ matchId: z.string(), result: wdl, opponent: z.string(), score: z.string() })
const nextMatchSchema = z.object({
  matchId: z.string(),
  opponent: z.string(),
  opponentCode: z.string().nullable(),
  kickoffTime: z.string(),
  result: wdl.nullable(),
  score: z.string().nullable(),
})
const headToHeadSchema = z.object({
  matchId: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeScore: z.number(),
  awayScore: z.number(),
  penaltiesHome: z.number().nullable(),
  penaltiesAway: z.number().nullable(),
  kickoffTime: z.string(),
  competitionSlug: z.string(),
  competitionName: z.string(),
})
const matchGoalViewSchema = z.object({
  side: z.enum(['HOME', 'AWAY']),
  teamName: z.string(),
  teamCode: z.string().nullable(),
  playerName: z.string(),
  minute: z.string().nullable(),
  ownGoal: z.boolean(),
  assistPlayerName: z.string().nullable(),
})
const allTimeMeetingSchema = z.object({
  date: z.string(),
  competition: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeCode: z.string().nullable(),
  awayCode: z.string().nullable(),
  homeScore: z.number(),
  awayScore: z.number(),
})
const allTimeH2HSchema = z.object({
  wins: z.number(),
  draws: z.number(),
  losses: z.number(),
  goalsFor: z.number(),
  goalsAgainst: z.number(),
  meetings: z.array(allTimeMeetingSchema),
})
const allTimeFormEntrySchema = z.object({
  result: wdl,
  opponent: z.string(),
  score: z.string(),
  date: z.string(),
  competition: z.string(),
})
const responseSchema = z.object({
  standings: z.array(standingRowSchema).nullable(),
  form: z.object({ home: z.array(formResultSchema), away: z.array(formResultSchema) }),
  next: z.object({ home: z.array(nextMatchSchema), away: z.array(nextMatchSchema) }),
  headToHead: z.array(headToHeadSchema),
  possession: z.object({ home: z.number().nullable(), away: z.number().nullable() }),
  goals: z.array(matchGoalViewSchema),
  h2hAll: allTimeH2HSchema.nullable(),
  formAll: z.object({ home: z.array(allTimeFormEntrySchema), away: z.array(allTimeFormEntrySchema) }).nullable(),
})

export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
  const id = getRouterParam(event, 'id') as string
  const insights = await getMatchInsights(db, id)
  if (!insights) throw createError({ statusCode: 404, statusMessage: 'match not found' })

  // All-time tally (incl. friendlies/qualifiers) from FIFA's full calendar,
  // from the home side's perspective. Optional enrichment - never blocks.
  let h2hAll = null
  let formAll = null
  const rows = await db
    .select({ home: match.homeTeamCode, away: match.awayTeamCode, kickoff: match.kickoffTime })
    .from(match)
    .where(eq(match.id, id))
    .limit(1)
  if (rows[0]?.home && rows[0]?.away) {
    const before = new Date(rows[0].kickoff).toISOString()
    const [all, homeForm, awayForm] = await Promise.all([
      getAllTimeHeadToHead(rows[0].home, rows[0].away, fetch, Date.now(), before),
      getTeamRecentResults(rows[0].home, before),
      getTeamRecentResults(rows[0].away, before),
    ])
    h2hAll = all
    formAll = homeForm || awayForm ? { home: homeForm ?? [], away: awayForm ?? [] } : null
  }

  return { ...insights, h2hAll, formAll }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Matches"
    ],
    "summary": "Match insights",
    "description": "Pre/post-match intelligence: recent form, next matches, head-to-head (within our competitions plus an all-time tally from FIFA's full international calendar, friendlies included), group standings, goals and possession.",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "description": "Internal match id (UUID).",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Insights bundle."
      }
    }
  },
})
