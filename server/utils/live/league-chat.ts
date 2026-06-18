import type { AppDatabase } from '../../../db/types'
import type { ChatMessageDTO } from '../../../shared/types/chat'
import { getLeagueMemberIds } from '../chat/service'
import { publishLeagueChatMessage } from './hub'

// A new chat message: push the ciphertext to that league's connected members
// only (the room is members-only, like league crowd/reaction pushes).
export async function publishChatMessage(db: AppDatabase, message: ChatMessageDTO): Promise<number> {
  const memberIds = await getLeagueMemberIds(db, message.leagueId)
  return publishLeagueChatMessage(message.leagueId, memberIds, message)
}
