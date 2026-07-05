import { db } from '../../../../db'
import { getProfileCard } from '../../../utils/share/profile-card'
import { verifyProfileToken } from '../../../utils/share/profile-token'

// Public summary for the profile share landing page (/p/[token]): the leak-safe
// numbers (already visible on the signed-in profile) it needs for its heading +
// SEO meta. The image itself is the OG PNG at /og/profile/[token].
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  const secret = useRuntimeConfig(event).betterAuthSecret
  const payload = verifyProfileToken(secret, token)
  if (!payload) throw createError({ statusCode: 404, statusMessage: 'share link not found' })

  let card
  try {
    card = await getProfileCard(db, { competitionId: payload.c, userId: payload.u })
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'share link not found' })
  }
  return { card }
})

defineRouteMeta({
  openAPI: {
    tags: ['Share'],
    summary: 'Profile share-card summary',
    description:
      'Resolves a signed profile token to the card numbers (rank, points, exacts, haul). Powers the public /p/[token] landing page. 404 on an unknown or invalid token.',
    parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: 'The profile card summary.' },
      '404': { description: 'Unknown or invalid share token.' },
    },
  },
})
