import { z } from 'zod'
import { db } from '../../../../../db'
import { editMessage } from '../../../../utils/chat/service'
import { publishEdit } from '../../../../utils/live/league-chat'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

const bodySchema = z.object({
  messageId: z.string().uuid(),
  ciphertext: z.string().min(1).max(16_384),
})

// The author edits their own message: store the re-encrypted text, stamp the edit
// time, and push the new ciphertext to the league's members so they re-decrypt it.
export default defineValidatedHandler({ body: bodySchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const { editedAt } = await editMessage(db, { leagueId, messageId: body.messageId, userId: user.id, ciphertext: body.ciphertext })
  const iso = editedAt.toISOString()
  void publishEdit(db, leagueId, body.messageId, body.ciphertext, iso).catch(() => {})
  return { editedAt: iso }
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Edit a chat message',
    description: 'The author replaces their own message text (re-encrypted client-side) while it is visible. Pushed live.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: '{ editedAt }.' },
      '403': { description: 'Not the author.' },
      '404': { description: 'Unknown message.' },
      '422': { description: 'Not editable / invalid body.' },
    },
  },
})
