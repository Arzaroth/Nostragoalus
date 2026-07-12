import { z } from 'zod'
import { db } from '../../../../db'
import { chatAttachmentSchema } from '../../../schemas/dm'
import { editDmMessage, requireParticipant } from '../../../utils/dm/service'
import { publishDmEdit } from '../../../utils/live/hub'
import { defineValidatedHandler } from '../../../utils/validated-handler'

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

// The author edits their own DM message: store the re-encrypted text, drop/append
// images, stamp the edit time, and push the new ciphertext + attachment set live to
// both participants. Author only, visible messages only.
export default defineValidatedHandler({ body: bodySchema, response: responseSchema }, async ({ body, user, event }) => {
  const threadId = getRouterParam(event, 'threadId') as string
  const { editedAt, attachments } = await editDmMessage(db, {
    threadId,
    messageId: body.messageId,
    userId: user.id,
    ciphertext: body.ciphertext,
    addImages: body.addImages,
    removeIdxs: body.removeIdxs,
  })
  const iso = editedAt.toISOString()
  const t = await requireParticipant(db, threadId, user.id)
  void Promise.resolve(publishDmEdit([user.id, t.otherId], threadId, body.messageId, body.ciphertext, iso, attachments))
  return { editedAt: iso, attachments }
})

defineRouteMeta({
  openAPI: {
    tags: ['DM'],
    summary: 'Edit a direct message',
    description: 'Author only. Replaces the ciphertext, drops/appends images, and pushes the edit + attachment set live to both participants.',
    parameters: [{ in: 'path', name: 'threadId', required: true, schema: { type: 'string' } }],
    responses: { '200': { description: '{ editedAt, attachments: ChatAttachmentDTO[] }.' }, '403': { description: 'Not the author.' }, '404': { description: 'Not found.' } },
  },
})
