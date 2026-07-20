import { z } from 'zod'
import { db } from '../../../db'
import { toHttpError } from '../../utils/http'
import { redeemMobileSsoCode } from '../../utils/sso/mobile-exchange'

// Deliberately NOT defineValidatedHandler: that wrapper requires a session, and
// the whole point of this route is to hand out the bearer that creates one. It
// carries no cookie auth, so there is nothing for CSRF to ride either - the code
// + verifier pair is the only credential, and both are single-use.
const bodySchema = z.object({ code: z.string(), state: z.string(), verifier: z.string() })

export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => undefined))
  if (!parsed.success) throw createError({ statusCode: 422, statusMessage: 'Invalid request body' })
  try {
    const token = await redeemMobileSsoCode(db, {
      ...parsed.data,
      clientKey: getRequestIP(event, { xForwardedFor: true }) ?? 'unknown',
    })
    return { token }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Auth'],
    summary: 'Exchange a mobile SSO code for a bearer token',
    description:
      'Trades the single-use code from the mobile SSO callback, plus the state and verifier the app generated, for the session bearer. Rate limited; a code works exactly once.',
    responses: {
      '200': { description: 'The session bearer token.' },
      '400': { description: 'Malformed or rate-limited request.' },
      '404': { description: 'Unknown, expired, already-used or mis-bound code.' },
    },
  },
})
