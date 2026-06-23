import type { AppDatabase } from '../../../db/types'
import type { ChatMessageDTO } from '../../../shared/types/chat'
import { getLeagueMemberIds } from '../chat/service'
import { publishChatKeysAdded, publishChatRekeyRequest, publishLeagueChatMessage } from './hub'

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
