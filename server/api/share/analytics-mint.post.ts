import { getRequestURL } from 'h3'
import { z } from 'zod'
import { db } from '../../../db'
import { NotFoundError } from '../../utils/errors'
import { resolveCompetition } from '../../utils/competitions/store'
import { getAnalyticsCard } from '../../utils/share/analytics-card'
import { SHARE_LOCALES } from '../../utils/share/token'
import { signAnalyticsToken } from '../../utils/share/analytics-token'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  competition: z.string().optional(),
  locale: z.enum(SHARE_LOCALES).optional(),
})

// Mints a signed analytics-card token for the caller's OWN bias report. The
// token only ever names the caller. With no scored pick yet there is nothing to
// report, so minting 404s until the report has data (mirrors wrapped's pre-final
// gate). Works mid-tournament otherwise - the analytics page is not final-gated.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const competition = await resolveCompetition(db, body.competition ?? null)
  if (!competition) throw new NotFoundError('competition not found')
  const card = await getAnalyticsCard(db, { competitionId: competition.id, userId: user.id })
  if (!card.hasData) throw new NotFoundError('analytics not ready')

  const secret = useRuntimeConfig(event).betterAuthSecret
  const token = signAnalyticsToken(secret, { u: user.id, c: competition.id, l: body.locale ?? 'en', v: 1 })
  const origin = getRequestURL(event).origin
  return {
    token,
    url: `${origin}/a/${token}`,
    imageUrl: `${origin}/og/analytics/${token}`,
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Share'],
    summary: 'Mint an analytics share-card link',
    description:
      'Creates a signed, stateless token for your own personal-analytics (bias detector) card and returns the landing-page and OG image URLs. The token names only you; 404 until you have a scored pick.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              competition: { type: 'string', description: 'Competition slug; defaults to the current tournament.' },
              locale: { type: 'string', enum: ['en', 'fr', 'th', 'tlh', 'ar'] },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'The token, landing URL and OG image URL.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown competition, or no scored pick to report yet.' },
    },
  },
})
