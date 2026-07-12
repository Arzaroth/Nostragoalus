import { z } from 'zod'
import { db } from '../../../../../db'
import { listReports } from '../../../../utils/chat/moderation'
import { moderationStateSchema } from '../../../../schemas/league-chat'
import { defineReadHandler } from '../../../../utils/read-handler'

const responseSchema = z.object({
  reports: z.array(z.object({
    id: z.string(),
    userId: z.string().nullable(),
    matchId: z.string().nullable(),
    epoch: z.number(),
    ciphertext: z.string(),
    moderation: moderationStateSchema,
    reports: z.number(),
    createdAt: z.string(),
  })),
})

// The moderation queue for owner/moderators: reported messages, most-reported
// first, with the ciphertext + epoch so the moderator can decrypt and read each
// one before ruling. The server stays blind to the plaintext.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const leagueId = getRouterParam(event, 'id') as string
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
