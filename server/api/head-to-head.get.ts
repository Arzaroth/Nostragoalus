import { db } from '../../db'
import { getHeadToHead } from '../utils/analytics/h2h'
import { resolveCompetition } from '../utils/competitions/store'
import { getSessionUser, isAdmin } from '../utils/auth-guards'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
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

  const competition = await resolveCompetition(db, (query.competition as string) || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  return getHeadToHead(db, {
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
