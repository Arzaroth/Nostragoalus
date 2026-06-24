import type { ReactionEmoji, ReactionTotals } from '../reactions'

export type ChatModerationState = 'VISIBLE' | 'PENDING' | 'REMOVED'

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
  hasAttachment: boolean
  // Moderation lifecycle; PENDING/REMOVED strip the ciphertext for non-moderators.
  moderation: ChatModerationState
  // Whether the caller has already reported this message (own messages: false).
  reported: boolean
  reactions: ReactionTotals
  myReaction: ReactionEmoji | null
}
