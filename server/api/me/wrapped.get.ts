import { z } from 'zod'
import { db } from '../../../db'
import { resolveCompetition } from '../../utils/competitions/store'
import { getWrapped } from '../../utils/wrapped/service'
import { defineReadHandler } from '../../utils/read-handler'

const querySchema = z.object({ competition: z.string().optional() })

const wrappedPickSchema = z.object({
  matchId: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeTeamCode: z.string().nullable(),
  awayTeamCode: z.string().nullable(),
  roundLabel: z.string(),
  kickoffTime: z.string(),
  predHome: z.number(),
  predAway: z.number(),
  actualHome: z.number().nullable(),
  actualAway: z.number().nullable(),
  tier: z.string().nullable(),
  totalPoints: z.number(),
  bonusPoints: z.number(),
  isJoker: z.boolean(),
  crowdSharePct: z.number().nullable(),
})

const journeyPointSchema = z.object({
  roundLabel: z.string(),
  sortOrder: z.number(),
  rank: z.number(),
  players: z.number(),
  points: z.number(),
})

const wrappedDtoSchema = z.object({
  ready: z.literal(true),
  competitionName: z.string(),
  displayName: z.string(),
  image: z.string().nullable(),
  totals: z.object({
    totalPoints: z.number(),
    predictionPoints: z.number(),
    championPoints: z.number(),
    bestScorerPoints: z.number(),
    rank: z.number().nullable(),
    players: z.number(),
    topPercent: z.number().nullable(),
  }),
  tiers: z.object({
    exact: z.number(),
    diff: z.number(),
    outcome: z.number(),
    miss: z.number(),
    predictions: z.number(),
    scoredMatches: z.number(),
    completionPct: z.number(),
  }),
  streaks: z.object({ exactStreak: z.number(), scoringStreak: z.number(), perfectRounds: z.number() }),
  bestPick: wrappedPickSchema.nullable(),
  biggestMiss: wrappedPickSchema.extend({ fieldExactPct: z.number() }).nullable(),
  jokers: z.object({ played: z.number(), points: z.number(), best: wrappedPickSchema.nullable() }),
  crowd: z.object({ bonusPoints: z.number(), biggestBonus: wrappedPickSchema.nullable(), loneWolf: z.number() }),
  meta: z.object({
    champion: z
      .object({ teamCode: z.string().nullable(), teamName: z.string(), points: z.number(), hit: z.boolean() })
      .nullable(),
    bestScorer: z
      .object({ playerName: z.string(), teamCode: z.string().nullable(), points: z.number(), hit: z.boolean() })
      .nullable(),
  }),
  chat: z.object({
    messages: z.number(),
    reactionsGiven: z.number(),
    reactionsReceived: z.number(),
    topEmoji: z.string().nullable(),
  }),
  haul: z.object({
    trophies: z.array(z.object({ type: z.string(), value: z.number(), teamCode: z.string().nullable() })),
    badges: z.array(z.object({ key: z.string(), tier: z.string().nullable() })),
  }),
  journey: z.array(journeyPointSchema),
})

const responseSchema = z.discriminatedUnion('ready', [
  wrappedDtoSchema,
  z.object({ ready: z.literal(false), competitionName: z.string() }),
])

export default defineReadHandler({ response: responseSchema, auth: 'user', query: querySchema }, async ({ user, query }) => {
  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  return getWrapped(db, { competitionId: competition.id, userId: user.id })
})

defineRouteMeta({
  openAPI: {
    tags: ['Account'],
    summary: 'My Tournament Wrapped',
    description:
      'The signed-in user\'s post-final recap: totals, rank and percentile, tier breakdown, best pick and biggest miss, joker and crowd stats, rank journey, chat counts, trophies and badges. Before the final is decided the response is { ready: false }.',
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
      '200': { description: 'The wrapped recap, or { ready: false } pre-final.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown competition.' },
    },
  },
})
