import type { ReactionEmoji, ReactionTotals } from '../reactions'

export type ChatModerationState = 'VISIBLE' | 'PENDING' | 'REMOVED'

// Room key for the league-global room (matchId null). Match threads key on their
// matchId. Shared by the client activity tracker, the read-marker store and the
// unread/mention aggregation so the three never drift on the sentinel.
export const GLOBAL_ROOM = '__global__'

// The room a message/marker belongs to: the matchId for a match thread, else the
// global sentinel. One place so server and client agree on the key.
export function roomKeyFor(matchId: string | null | undefined): string {
  return matchId ?? GLOBAL_ROOM
}

// Max plaintext length of a chat message. The server only ever sees ciphertext,
// so this is a client-enforced limit (the composer blocks a send past it); the
// 16 KB ciphertext cap in the post route is the server-side backstop.
export const MAX_MESSAGE_TEXT_LENGTH = 2000

// Open-graph-ish metadata for a link unfurl. The client extracts a URL from a
// (locally decrypted) message and asks the server to fetch this for it - the URL
// reaches the server, but never the message text. All fields are null when the
// page had no usable metadata.
export interface LinkPreviewDTO {
  url: string
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

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
  threadId: string | null
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
  // Number of replies in this message's thread (main-list messages only; a thread
  // reply itself reports 0). Thread replies live in the thread, not the main list.
  threadCount: number
}

// One room with unread chat activity, for the cross-league inbox. roomKey is the
// matchId (a match thread) or GLOBAL_ROOM (the league room); home/away name the
// match when it is a thread. `unread` is the message count since the user's read
// marker (floored at their league join); `mentions` is how many of those are
// unread @mentions of them. lastAt = newest unread message (ISO), for sorting.
export interface ChatUnreadRoomDTO {
  leagueId: string
  leagueName: string
  competitionSlug: string
  roomKey: string
  matchId: string | null
  homeTeam: string | null
  awayTeam: string | null
  unread: number
  mentions: number
  lastAt: string | null
}

// One image in a room's media gallery: which message it belongs to plus its
// idx/epoch (so the lightbox can fetch + decrypt it) and when it was posted.
export interface ChatMediaItemDTO {
  messageId: string
  idx: number
  epoch: number
  createdAt: string
}
