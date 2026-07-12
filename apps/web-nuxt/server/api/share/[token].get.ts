import { z } from 'zod'
import { db } from '../../../db'
import { getPredictionForShare } from '../../utils/predictions/service'
import { buildShareCardData } from '../../utils/share/card'
import { SHARE_LOCALES, verifyShareToken } from '../../utils/share/token'
import { defineReadHandler } from '../../utils/read-handler'

const responseSchema = z.object({
  card: z.object({
    state: z.enum(['result', 'live', 'reveal', 'sealed']),
    locale: z.enum(SHARE_LOCALES),
    ownerName: z.string(),
    competitionName: z.string(),
    roundLabel: z.string(),
    group: z.string().nullable(),
    homeTeam: z.string(),
    awayTeam: z.string(),
    homeTeamCode: z.string().nullable(),
    awayTeamCode: z.string().nullable(),
    predHome: z.number().nullable(),
    predAway: z.number().nullable(),
    actualHome: z.number().nullable(),
    actualAway: z.number().nullable(),
    pensHome: z.number().nullable(),
    pensAway: z.number().nullable(),
    tier: z.string().nullable(),
    totalPoints: z.number().nullable(),
    isJoker: z.boolean(),
    crowdSharePct: z.number().nullable(),
  }),
  matchId: z.string(),
  competitionSlug: z.string(),
})

// Public summary for the share landing page (/s/[token]) to render its heading +
// CTA and SEO meta. Returns the same leak-safe ShareCardData the image uses (a
// sealed pick carries no score), plus the match it links back to.
export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
  const token = getRouterParam(event, 'token')
  const secret = useRuntimeConfig(event).betterAuthSecret
  const payload = verifyShareToken(secret, token)
  if (!payload) throw createError({ statusCode: 404, statusMessage: 'share link not found' })

  const row = await getPredictionForShare(db, payload.p)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'share link not found' })

  const card = buildShareCardData(row, { mode: payload.m, locale: payload.l })
  return { card, matchId: row.matchId, competitionSlug: row.competitionSlug }
})

defineRouteMeta({
  openAPI: {
    tags: ['Share'],
    summary: 'Share-card summary',
    description:
      'Resolves a signed share token to the card data (leak-safe: a sealed pick exposes no score) plus the match it links back to. Powers the public /s/[token] landing page. 404 on an unknown or invalid token.',
    parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: 'The card summary and link target.' },
      '404': { description: 'Unknown or invalid share token.' },
    },
  },
})
