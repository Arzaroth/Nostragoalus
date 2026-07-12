import { z } from 'zod'
import { db } from '../../../../../db'
import { editMessage } from '../../../../utils/chat/service'
import { publishEdit } from '../../../../utils/live/league-chat'
import { chatAttachmentSchema } from '../../../../schemas/dm'
import { defineValidatedHandler } from '../../../../utils/validated-handler'

const bodySchema = z.object({
  messageId: z.string().uuid(),
  ciphertext: z.string().min(1).max(16_384),
  // Images to append (sealed under the current epoch) and idxs of images to drop.
  addImages: z
    .array(z.object({ ciphertext: z.string().min(1).max(9_000_000), byteSize: z.number().int().positive() }))
    .max(6)
    .optional(),
  removeIdxs: z.array(z.number().int().nonnegative()).optional(),
})

const responseSchema = z.object({ editedAt: z.string(), attachments: z.array(chatAttachmentSchema) })

// The author edits their own message: store the re-encrypted text, drop/append
// images, stamp the edit time, and push the new ciphertext + attachment set to the
// league's members so they re-decrypt it in place.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user, event }) => {
  const leagueId = getRouterParam(event, 'id') as string
  const { editedAt, attachments } = await editMessage(db, {
    leagueId,
    messageId: body.messageId,
    userId: user.id,
    ciphertext: body.ciphertext,
    addImages: body.addImages,
    removeIdxs: body.removeIdxs,
  })
  const iso = editedAt.toISOString()
  void publishEdit(db, leagueId, body.messageId, body.ciphertext, iso, attachments).catch(() => {})
  return { editedAt: iso, attachments }
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
