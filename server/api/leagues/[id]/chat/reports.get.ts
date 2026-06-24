import { db } from '../../../../../db'
import { requireUser } from '../../../../utils/auth-guards'
import { listReports } from '../../../../utils/chat/moderation'
import { toHttpError } from '../../../../utils/http'

// The moderation queue for owner/moderators: reported messages, most-reported
// first, with the ciphertext + epoch so the moderator can decrypt and read each
// one before ruling. The server stays blind to the plaintext.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const leagueId = getRouterParam(event, 'id') as string
  try {
    const rows = await listReports(db, { leagueId, actorId: user.id })
    return {
      reports: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        matchId: r.matchId,
        epoch: r.epoch,
        ciphertext: r.ciphertext,
        moderation: r.moderationState,
        reports: r.reports,
        createdAt: r.createdAt.toISOString(),
      })),
    }
  } catch (error) {
    throw toHttpError(error)
  }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'List reported chat messages',
    description: 'OWNER/MODERATOR only. Reported messages with their report counts and ciphertext for review.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ reports: [...] }.' }, '403': { description: 'Not a moderator.' } },
  },
})
