import { getRequestURL } from 'h3'
import { z } from 'zod'
import { db } from '../../../db'
import { NotFoundError } from '../../utils/errors'
import { getOwnPredictionRef } from '../../utils/predictions/service'
import { SHARE_LOCALES, signShareToken, type ShareMode } from '../../utils/share/token'
import { defineValidatedHandler } from '../../utils/validated-handler'

const bodySchema = z.object({
  matchId: z.string().uuid(),
  // The client asks for a pre-kickoff mode; the server has the final say below.
  mode: z.enum(['sealed', 'reveal', 'result']),
  locale: z.enum(SHARE_LOCALES).optional(),
})

// Mints a signed share token for the caller's OWN pick on a match. Looking the
// pick up by userId makes ownership intrinsic: a third party can't get a token
// (let alone a reveal) for someone else's pick.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const row = await getOwnPredictionRef(db, user.id, body.matchId)
  if (!row) throw new NotFoundError('no prediction to share')

  // Mode is derived from match timing, not trusted from the client: once kicked
  // off the score is public (result), and before kickoff only an explicit reveal
  // exposes it - anything else stays sealed.
  const locked = Date.now() >= new Date(row.kickoffTime).getTime()
  const mode: ShareMode = locked ? 'result' : body.mode === 'reveal' ? 'reveal' : 'sealed'
  const locale = body.locale ?? 'en'

  const secret = useRuntimeConfig(event).betterAuthSecret
  const token = signShareToken(secret, { p: row.id, m: mode, l: locale, v: 1 })
  const origin = getRequestURL(event).origin
  return {
    token,
    mode,
    url: `${origin}/s/${token}`,
    imageUrl: `${origin}/og/share/${token}`,
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Share'],
    summary: 'Mint a share-card link',
    description:
      'Creates a signed, stateless share token for your own pick on a match and returns the public share-page URL and OG image URL. Mode is forced by match timing: a kicked-off pick shares its result, a pre-kickoff pick is sealed unless reveal is requested.',
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['matchId', 'mode'],
            properties: {
              matchId: { type: 'string', format: 'uuid' },
              mode: { type: 'string', enum: ['sealed', 'reveal', 'result'] },
              locale: { type: 'string', enum: ['en', 'fr', 'th', 'tlh', 'ar'] },
            },
          },
        },
      },
    },
    responses: {
      '200': { description: 'The signed token and absolute share + image URLs.' },
      '404': { description: 'You have no pick on that match to share.' },
    },
  },
})
