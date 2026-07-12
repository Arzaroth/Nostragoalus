import { z } from 'zod'
import { db } from '../../../../db'
import { defineReadHandler } from '../../../utils/read-handler'
import { getAnalyticsCard } from '../../../utils/share/analytics-card'
import { verifyAnalyticsToken } from '../../../utils/share/analytics-token'

const responseSchema = z.object({
  card: z.object({
    displayName: z.string(),
    competitionName: z.string(),
    hasData: z.boolean(),
    accuracyPct: z.number(),
    exactPct: z.number(),
    goalLean: z.number(),
    homeBiasPct: z.number(),
  }),
})

// Public summary for the analytics share landing page (/a/[token]): the headline
// bias numbers it needs for its heading + SEO meta. The image is the OG PNG at
// /og/analytics/[token].
export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
  const token = getRouterParam(event, 'token')
  const secret = useRuntimeConfig(event).betterAuthSecret
  const payload = verifyAnalyticsToken(secret, token)
  if (!payload) throw createError({ statusCode: 404, statusMessage: 'share link not found' })

  let card
  try {
    card = await getAnalyticsCard(db, { competitionId: payload.c, userId: payload.u })
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'share link not found' })
  }
  if (!card.hasData) throw createError({ statusCode: 404, statusMessage: 'share link not found' })
  return { card }
})

defineRouteMeta({
  openAPI: {
    tags: ['Share'],
    summary: 'Analytics share-card summary',
    description:
      'Resolves a signed analytics token to the headline bias numbers (accuracy, exact rate, goal lean, home bias). Powers the public /a/[token] landing page. 404 on an unknown/invalid token or a user with no scored pick.',
    parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: 'The analytics card summary.' },
      '404': { description: 'Unknown or invalid share token.' },
    },
  },
})
