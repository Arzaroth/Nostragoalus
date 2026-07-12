import { getRequestURL } from 'h3'
import { z } from 'zod'
import { db } from '../../../db'
import { NotFoundError } from '../../utils/errors'
import { shareLinksSchema } from '../../schemas/roadmap'
import { resolveCompetition } from '../../utils/competitions/store'
import { SHARE_LOCALES } from '../../utils/share/token'
import { signProfileToken } from '../../utils/share/profile-token'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  competition: z.string().optional(),
  locale: z.enum(SHARE_LOCALES).optional(),
})

// Mints a signed profile-card token for the caller's OWN profile. The token only
// ever names the caller, so a third party can't render someone else's card, and
// the card is reachable only by the link the owner chooses to share. Works
// mid-tournament (no final gate) - it is a snapshot of the current standing.
export default defineValidatedHandler({ body: bodySchema, response: shareLinksSchema }, async ({ body, user, event }) => {
  const competition = await resolveCompetition(db, body.competition ?? null)
  if (!competition) throw new NotFoundError('competition not found')

  const secret = useRuntimeConfig(event).betterAuthSecret
  const token = signProfileToken(secret, { u: user.id, c: competition.id, l: body.locale ?? 'en', v: 1 })
  const origin = getRequestURL(event).origin
  return {
    token,
    url: `${origin}/p/${token}`,
    imageUrl: `${origin}/og/profile/${token}`,
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Share'],
    summary: 'Mint a profile share-card link',
    description:
      'Creates a signed, stateless token for your own profile card (rank, points, exacts, haul) and returns the landing-page and OG image URLs. The token names only you.',
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
      '404': { description: 'Unknown competition.' },
    },
  },
})
