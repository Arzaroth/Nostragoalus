import { z } from 'zod'
import { db } from '../../db'
import { getHeadToHead } from '../utils/analytics/h2h'
import { resolveCompetition } from '../utils/competitions/store'
import { getSessionUser, isAdmin } from '../utils/auth-guards'
import { defineReadHandler } from '../utils/read-handler'

const playerSchema = z.object({ id: z.string(), name: z.string(), image: z.string().nullable() })
const matchSchema = z.object({
  matchId: z.string(),
  home: z.string(),
  away: z.string(),
  homeCode: z.string().nullable(),
  awayCode: z.string().nullable(),
  actual: z.string(),
  aPredicted: z.string(),
  bPredicted: z.string(),
  aPoints: z.number(),
  bPoints: z.number(),
  winner: z.enum(['a', 'b', 'tie']),
  diverged: z.boolean(),
})
const responseSchema = z.object({
  competitionName: z.string(),
  a: playerSchema,
  b: playerSchema,
  shared: z.number(),
  hasData: z.boolean(),
  aPoints: z.number(),
  bPoints: z.number(),
  aWins: z.number(),
  bWins: z.number(),
  ties: z.number(),
  agreement: z.object({ sameScore: z.number(), sameOutcome: z.number() }),
  overTime: z.array(z.object({ label: z.string(), order: z.number(), aPoints: z.number(), bPoints: z.number() })),
  divergences: z.array(matchSchema),
})

const querySchema = z.object({
  a: z.string().optional(),
  b: z.string().optional(),
  competition: z.string().optional(),
})

export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ event, query }) => {
  const viewer = await getSessionUser(event)
  const admin = await isAdmin(event)

  // 'me' resolves to the signed-in viewer, so a profile can link "compare with me"
  // without knowing its own id.
  const resolveId = (v: unknown): string | null => {
    if (typeof v !== 'string' || !v) return null
    return v === 'me' ? (viewer?.id ?? null) : v
  }
  const aId = resolveId(query.a)
  const bId = resolveId(query.b)
  if (!aId || !bId) throw createError({ statusCode: 400, statusMessage: 'two players required' })
  if (aId === bId) throw createError({ statusCode: 400, statusMessage: 'players must differ' })

  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  // NotFoundError (unknown or unviewable-private player) maps to 404 by the read
  // handler, the same status a genuinely missing user gets, so a private account
  // is never distinguishable from a non-existent one.
  return await getHeadToHead(db, {
    competitionId: competition.id,
    aId,
    bId,
    viewerId: viewer?.id ?? null,
    isAdmin: admin,
  })
})

defineRouteMeta({
  openAPI: {
    tags: ['Users'],
    summary: 'Head-to-head comparison',
    description:
      "Compares two players over the matches they have both had scored in one competition: points, per-match wins, pick agreement, the lead over time and the biggest divergences. Use 'me' for either id to mean the signed-in user. A private profile 404s for anyone who cannot view it.",
    parameters: [
      { in: 'query', name: 'a', required: true, description: "First player's user id, or 'me'.", schema: { type: 'string' } },
      { in: 'query', name: 'b', required: true, description: "Second player's user id, or 'me'.", schema: { type: 'string' } },
      {
        in: 'query',
        name: 'competition',
        required: false,
        description: "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        schema: { type: 'string' },
      },
    ],
    responses: {
      200: { description: 'The head-to-head report.' },
      400: { description: 'Missing or identical player ids.' },
      404: { description: 'Unknown competition or user, or a private profile the caller cannot view.' },
    },
  },
})
