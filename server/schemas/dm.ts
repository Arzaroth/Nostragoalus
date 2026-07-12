import { z } from 'zod'
import { REACTION_EMOJIS } from '../../shared/reactions'

// Response schemas shared by the DM + reactions routes. They mirror the wire DTOs
// in shared/types (chat + dm) and shared/reactions, so the handler-return typecheck
// (see server/utils/validated-handler.ts) proves each route still matches its
// contract. Lives under server/schemas (out of the coverage gate) like prediction.ts.

// ReactionTotals: a full per-emoji count map (zeros included).
export const reactionTotalsSchema = z.object({
  FIRE: z.number(),
  GOAL: z.number(),
  WOW: z.number(),
  LAUGH: z.number(),
  SAD: z.number(),
  ANGRY: z.number(),
})

// One stored reaction key (the glyph is rendered client-side).
export const reactionEmojiSchema = z.enum(REACTION_EMOJIS)

// ChatAttachmentDTO: one encrypted image descriptor on a message.
export const chatAttachmentSchema = z.object({
  idx: z.number(),
  epoch: z.number(),
})

// ChatMessageDTO: the wire shape for one encrypted chat/DM message.
export const chatMessageSchema = z.object({
  id: z.string(),
  leagueId: z.string(),
  matchId: z.string().nullable(),
  parentId: z.string().nullable(),
  threadId: z.string().nullable(),
  userId: z.string().nullable(),
  epoch: z.number(),
  ciphertext: z.string(),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  attachments: z.array(chatAttachmentSchema),
  moderation: z.enum(['VISIBLE', 'PENDING', 'REMOVED']),
  reported: z.boolean(),
  reactions: reactionTotalsSchema,
  myReaction: reactionEmojiSchema.nullable(),
  threadCount: z.number(),
})

// DmParticipantDTO: the other party's public identity (name, avatar, chat key).
export const dmParticipantSchema = z.object({
  userId: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  publicKey: z.string(),
})
