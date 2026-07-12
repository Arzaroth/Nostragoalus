import { z } from 'zod'
import { db } from '../../../../db'
import { getSessionUser } from '../../../utils/auth-guards'
import { getMembership } from '../../../utils/leagues/service'
import { previewInvite } from '../../../utils/leagues/invites'
import { defineReadHandler } from '../../../utils/read-handler'

// InvitePreview (server/utils/leagues/invites.ts) plus the viewer-scoped flags.
const responseSchema = z.object({
  status: z.enum(['VALID', 'EXPIRED', 'EXHAUSTED']),
  league: z.object({ id: z.string(), name: z.string(), memberCount: z.number() }),
  competition: z.object({ slug: z.string(), name: z.string() }).nullable(),
  alreadyMember: z.boolean(),
  authenticated: z.boolean(),
})

// Public on purpose: the unguessable token IS the credential, and the join
// landing page must render the league's name before sign-in.
export default defineReadHandler({ response: responseSchema }, async ({ event }) => {
  const token = getRouterParam(event, 'token')!
  const preview = await previewInvite(db, token)
  if (!preview) throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  const user = await getSessionUser(event)
  const alreadyMember = user ? !!(await getMembership(db, preview.league.id, user.id)) : false
  return { ...preview, alreadyMember, authenticated: !!user }
})

defineRouteMeta({
  openAPI: {
    "tags": ["Leagues"],
    "summary": "Preview an invite link",
    "description": "Public: league name, member count and invite status for the join landing page.",
    "responses": {
      "200": { "description": "League preview + invite status (VALID/EXPIRED/EXHAUSTED)." },
      "404": { "description": "Unknown token." }
    }
  },
})
