import type { AppDatabase } from '../../../db/types'
import type { ChatMessageDTO } from '../../../shared/types/chat'
import { getLeagueMemberIds } from '../chat/service'
import { getMessageReactionTotals } from '../chat/reactions'
import {
  publishChatKeysAdded,
  publishChatModeration,
  publishChatReactionUpdate,
  publishChatRekeyRequest,
  publishChatStateChanged,
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
