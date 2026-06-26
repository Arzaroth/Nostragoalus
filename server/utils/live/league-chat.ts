import type { AppDatabase } from '../../../db/types'
import type { ChatAttachmentDTO, ChatMessageDTO } from '../../../shared/types/chat'
import { getLeagueMemberIds } from '../chat/service'
import { getMessageReactionTotals } from '../chat/reactions'
import {
  publishChatEdit,
  publishChatKeysAdded,
  publishChatModeration,
  publishChatReactionUpdate,
  publishChatRekeyRequest,
  publishChatStateChanged,
  publishChatTyping,
  publishLeagueChatMessage,
} from './hub'
import type { ChatModerationState } from '../../../shared/types/chat'

// A new chat message: push the ciphertext to that league's connected members
// only (the room is members-only, like league crowd/reaction pushes).
export async function publishChatMessage(db: AppDatabase, message: ChatMessageDTO): Promise<number> {
  const memberIds = await getLeagueMemberIds(db, message.leagueId)
  return publishLeagueChatMessage(message.leagueId, memberIds, message)
}

// A member without the current key asks the league's keyholders to re-seal it.
// Broadcast to that league's connected members; only a keyholder client acts.
export async function publishRekeyRequest(db: AppDatabase, leagueId: string): Promise<number> {
  const memberIds = await getLeagueMemberIds(db, leagueId)
  return publishChatRekeyRequest(leagueId, memberIds)
}

// A keyholder sealed the key for these members: tell them to reload and open it.
export function publishKeysAdded(leagueId: string, recipientIds: readonly string[]): number {
  return publishChatKeysAdded(leagueId, recipientIds)
}

// Chat was enabled/disabled/rotated: nudge the league's connected members to
// reload so the change shows live.
export async function publishStateChanged(db: AppDatabase, leagueId: string): Promise<number> {
  const memberIds = await getLeagueMemberIds(db, leagueId)
  return publishChatStateChanged(leagueId, memberIds)
}

// A message's reactions changed: push its fresh per-emoji totals to the members.
export async function publishChatReaction(db: AppDatabase, leagueId: string, messageId: string): Promise<number> {
  const [memberIds, totals] = await Promise.all([
    getLeagueMemberIds(db, leagueId),
    getMessageReactionTotals(db, messageId),
  ])
  return publishChatReactionUpdate(leagueId, memberIds, messageId, totals)
}

// A message was auto-hidden, removed or restored: tell the members to update it.
export async function publishModeration(
  db: AppDatabase,
  leagueId: string,
  messageId: string,
  state: ChatModerationState,
): Promise<number> {
  const memberIds = await getLeagueMemberIds(db, leagueId)
  return publishChatModeration(leagueId, memberIds, messageId, state)
}

// Typing pings fire often (one per member every few seconds while composing), so
// the league member set - which only changes on join/leave - is cached briefly to
// keep the hot path off the database. The cache is keyed by league and expires
// quickly so a new member starts receiving typing hints within seconds.
const TYPING_MEMBERS_TTL_MS = 10_000
const typingMembersCache = new Map<string, { ids: string[]; at: number }>()

// A member is typing: broadcast it to the room's other connected members. Returns
// false (no fan-out) when the typer is not actually a league member, so a stranger
// cannot inject typing hints. nowMs is passed in (the caller stamps it) to keep
// this testable and to avoid a bare Date.now() in shared code paths.
export async function publishTyping(
  db: AppDatabase,
  opts: { leagueId: string; matchId: string | null; userId: string; nowMs: number },
): Promise<boolean> {
  const cached = typingMembersCache.get(opts.leagueId)
  let ids: string[]
  if (cached && opts.nowMs - cached.at < TYPING_MEMBERS_TTL_MS) {
    ids = cached.ids
  } else {
    ids = await getLeagueMemberIds(db, opts.leagueId)
    typingMembersCache.set(opts.leagueId, { ids, at: opts.nowMs })
  }
  if (!ids.includes(opts.userId)) return false
  const recipients = ids.filter((id) => id !== opts.userId)
  publishChatTyping(opts.leagueId, recipients, opts.matchId, opts.userId)
  return true
}

// A message was edited by its author: push the new ciphertext + edit time + the
// resulting attachment set (descriptors only - the bytes are fetched on demand).
export async function publishEdit(
  db: AppDatabase,
  leagueId: string,
  messageId: string,
  ciphertext: string,
  editedAt: string,
  attachments: ChatAttachmentDTO[],
): Promise<number> {
  const memberIds = await getLeagueMemberIds(db, leagueId)
  return publishChatEdit(leagueId, memberIds, messageId, ciphertext, editedAt, attachments)
}
