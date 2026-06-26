import type { ReactionEmoji, ReactionTotals } from '../reactions'

export type ChatModerationState = 'VISIBLE' | 'PENDING' | 'REMOVED'

// Max plaintext length of a chat message. The server only ever sees ciphertext,
// so this is a client-enforced limit (the composer blocks a send past it); the
// 16 KB ciphertext cap in the post route is the server-side backstop.
export const MAX_MESSAGE_TEXT_LENGTH = 2000

// One encrypted image on a message. idx is its order within the message (stable,
// gaps allowed after a remove); epoch is the group-key epoch the bytes were sealed
// under, so the client decrypts each with its own epoch's key. The (messageId,
// idx) pair identifies the row server-side; the ciphertext is fetched on demand.
export interface ChatAttachmentDTO {
  idx: number
  epoch: number
}

// Wire shape for an encrypted chat message. The server fills everything except
// the plaintext: ciphertext stays opaque to it. matchId null = the league-global
// room, set = a per-match thread. createdAt is an ISO string over the wire.
// Reactions are plaintext emoji counts (the server sees the glyph, not content);
// myReaction is the caller's own reaction on this message, if any.
export interface ChatMessageDTO {
  id: string
  leagueId: string
  matchId: string | null
  parentId: string | null
  userId: string | null
  epoch: number
  ciphertext: string
  createdAt: string
  editedAt: string | null
  // The message's images, ordered by idx (empty if none, or stripped when hidden).
  attachments: ChatAttachmentDTO[]
  // Moderation lifecycle; PENDING/REMOVED strip the ciphertext for non-moderators.
  moderation: ChatModerationState
  // Whether the caller has already reported this message (own messages: false).
  reported: boolean
  reactions: ReactionTotals
  myReaction: ReactionEmoji | null
}

// One image in a room's media gallery: which message it belongs to plus its
// idx/epoch (so the lightbox can fetch + decrypt it) and when it was posted.
export interface ChatMediaItemDTO {
  messageId: string
  idx: number
  epoch: number
  createdAt: string
}
