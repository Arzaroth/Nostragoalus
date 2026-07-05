// Direct messages: a two-party end-to-end-encrypted conversation. The server only
// ever holds ciphertext and sealed keys, exactly like league chat; these are the
// wire shapes the DM API and the WS `dm:*` pushes carry. A DM message is stored as
// a chat_message row (dmThreadId set), so it shares the chat crypto and, over time,
// its reactions/attachments/reply machinery.

// One epoch's sealed key for the caller (the DM thread key sealed to their public
// key). History keeps its epoch so a rotated-out key still decrypts old messages.
export interface DmEpochKeyDTO {
  epoch: number
  wrappedKey: string
}

// The other participant's public identity: their name, avatar and chat public key
// (so the caller's client can seal the thread key to them on first contact).
export interface DmParticipantDTO {
  userId: string
  name: string
  image: string | null
  publicKey: string
}

// One conversation in the DM inbox: the other participant, newest-activity time,
// the caller's unread count and their sealed key for the current epoch (so the
// list can decrypt the last message without a second round trip).
export interface DmThreadSummaryDTO {
  threadId: string
  other: { id: string; name: string; image: string | null }
  lastMessageAt: string | null
  unread: number
  myWrappedKey: string | null
}

// Full detail for one open thread: the current epoch, the other participant's
// public identity and the caller's sealed key for every epoch.
export interface DmThreadDetailDTO {
  threadId: string
  epoch: number
  other: DmParticipantDTO
  myWrappedKeys: DmEpochKeyDTO[]
}

// A candidate to start a DM with. `shared` marks a league co-member (always
// searchable) versus a globally discoverable stranger.
export interface DmRecipientDTO {
  userId: string
  name: string
  image: string | null
  shared: boolean
}

// Deep link for a DM notification (bell click + web push): open the app with the
// DM dock focused on the thread. DMs are not competition-scoped, so this is a bare
// query the client's deep-link handler reads on load.
export function dmPath(threadId: string): string {
  return `/?dm=${encodeURIComponent(threadId)}`
}
