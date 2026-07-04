import { z } from 'zod'
import { db } from '../../../../db'
import { editDmMessage, requireParticipant } from '../../../utils/dm/service'
import { publishDmEdit } from '../../../utils/live/hub'
import { defineValidatedHandler } from '../../../utils/validated-handler'

const bodySchema = z.object({
  messageId: z.string().uuid(),
  ciphertext: z.string().min(1).max(16_384),
})

// The author replaces their own DM message text (re-encrypted client-side) and the
// edit is pushed live to both participants. Author only, visible messages only.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const threadId = getRouterParam(event, 'threadId') as string
  const { editedAt } = await editDmMessage(db, { threadId, messageId: body.messageId, userId: user.id, ciphertext: body.ciphertext })
  const t = await requireParticipant(db, threadId, user.id)
  void Promise.resolve(publishDmEdit([user.id, t.otherId], threadId, body.messageId, body.ciphertext, editedAt.toISOString()))
  return { editedAt: editedAt.toISOString() }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'Edit a direct message',
    description: 'Author only. Replaces the ciphertext and pushes the edit live to both participants.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ editedAt }.' }, '403': { description: 'Not the author.' }, '404': { description: 'Not found.' } },
  },
})
