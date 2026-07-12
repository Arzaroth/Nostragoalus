import { getRequestURL } from 'h3'
import { z } from 'zod'
import { db } from '../../../db'
import { NotFoundError } from '../../utils/errors'
import { resolveCompetition } from '../../utils/competitions/store'
import { hasDecidedFinal } from '../../utils/awards/service'
import { SHARE_LOCALES } from '../../utils/share/token'
import { signWrappedToken } from '../../utils/share/wrapped-token'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  competition: z.string().optional(),
  locale: z.enum(SHARE_LOCALES).optional(),
})

const responseSchema = z.object({ token: z.string(), imageUrl: z.string() })

// Mints a signed wrapped-card token for the caller's OWN recap. The token only
// ever names the caller, so a third party can't render someone else's card.
// Pre-final there is no recap to share, so minting 404s until the gate opens.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user, event }) => {
  const competition = await resolveCompetition(db, body.competition ?? null)
  if (!competition) throw new NotFoundError('competition not found')
  if (!(await hasDecidedFinal(db, competition.id))) throw new NotFoundError('wrapped not ready')

  const secret = useRuntimeConfig(event).betterAuthSecret
  const token = signWrappedToken(secret, { u: user.id, c: competition.id, l: body.locale ?? 'en', v: 1 })
  const origin = getRequestURL(event).origin
  return {
    token,
    imageUrl: `${origin}/og/wrapped/${token}`,
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Share'],
    summary: 'Mint a wrapped share-card link',
    description:
      'Creates a signed, stateless token for your own Tournament Wrapped summary card and returns the OG image URL. Only available once the final is decided.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              competition: { type: 'string', description: "Competition slug; defaults to the current tournament." },
              locale: { type: 'string', enum: ['en', 'fr', 'th', 'tlh', 'ar'] },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'The token and OG image URL.' },
      '401': { description: 'Not signed in.' },
      '404': { description: 'Unknown competition, or the final is not decided yet.' },
    },
  },
})
