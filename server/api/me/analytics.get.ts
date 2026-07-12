import { z } from 'zod'
import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { getAnalytics } from '../../utils/analytics/service'
import { defineReadHandler } from '../../utils/read-handler'

const querySchema = z.object({ competition: z.string().optional() })

const outcomeCountsSchema = z.object({ home: z.number(), draw: z.number(), away: z.number() })
const tierCountsSchema = z.object({ exact: z.number(), diff: z.number(), outcome: z.number(), miss: z.number() })
const teamBiasSchema = z.object({
  code: z.string().nullable(),
  name: z.string(),
  sample: z.number(),
  predictedWinRate: z.number(),
  actualWinRate: z.number(),
  delta: z.number(),
})
const roundAccuracySchema = z.object({
  label: z.string(),
  order: z.number(),
  picks: z.number(),
  accuracy: z.number(),
  points: z.number(),
})
const pickHighlightSchema = z.object({
  home: z.string(),
  away: z.string(),
  homeCode: z.string().nullable(),
  awayCode: z.string().nullable(),
  predicted: z.string(),
  actual: z.string(),
  points: z.number(),
  tier: z.string(),
  isJoker: z.boolean(),
})
const fergieMatchSchema = z.object({
  home: z.string(),
  away: z.string(),
  homeCode: z.string().nullable(),
  awayCode: z.string().nullable(),
  predicted: z.string(),
  actual: z.string(),
  gained: z.number(),
  lost: z.number(),
  net: z.number(),
  isJoker: z.boolean(),
})
const responseSchema = z.object({
  competitionName: z.string(),
  hasData: z.boolean(),
  totalPicks: z.number(),
  totalPoints: z.number(),
  avgPoints: z.number(),
  tiers: tierCountsSchema,
  accuracy: z.number(),
  exactRate: z.number(),
  goals: z.object({ predictedAvg: z.number(), actualAvg: z.number(), lean: z.number() }),
  outcomeLean: z.object({
    predicted: outcomeCountsSchema,
    actual: outcomeCountsSchema,
    homeBiasPct: z.number(),
    drawGapPct: z.number(),
  }),
  teams: z.object({ overrated: z.array(teamBiasSchema), underrated: z.array(teamBiasSchema) }),
  overTime: z.array(roundAccuracySchema),
  streak: z.object({ current: z.number(), best: z.number() }),
  bestCall: pickHighlightSchema.nullable(),
  worstMiss: pickHighlightSchema.nullable(),
  fergieTime: z.object({
    matches: z.number(),
    goals: z.number(),
    netPoints: z.number(),
    pointsWon: z.number(),
    pointsLost: z.number(),
    biggestGain: fergieMatchSchema.nullable(),
    biggestLoss: fergieMatchSchema.nullable(),
    breakdown: z.array(fergieMatchSchema),
  }),
})

export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ user, query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  return getAnalytics(db, { competitionId: competition.id, userId: user.id })
})

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'My prediction analytics',
    description:
      "The signed-in user's prediction bias report for a competition: tier breakdown, goals over/under-prediction, home-win and draw lean, teams they over- and under-rate, accuracy by round, best call and biggest miss. Unlike Wrapped it is not gated on the final; { hasData: false } until the user has a scored pick.",
    parameters: [
      {
        in: 'query',
        name: 'competition',
        required: false,
        description: "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: 'The analytics report, or { hasData: false } with no scored picks.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown competition.' },
    },
  },
})
