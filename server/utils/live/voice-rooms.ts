// In-process voice-room bookkeeping: who is in which call, kept correct across
// join, leave (from a takeover) and disconnect. A "room" is a call, keyed by an
// opaque scope string (a DM thread or a league/match room - the key is built by
// shared/types/voice `voiceRoomKey`). This module is pure: it never touches the
// socket, sends nothing, and owns no WebRTC - the hub fans roster/signal frames
// out and reads room state from here.
//
// One endpoint per user per room. A voice call needs a single mic per person, so
// a user is represented in a room by exactly one socket (token). Joining the same
// room from a second tab TAKES OVER: the old tab is evicted (returned to the
// caller so the hub can tell it to drop the call) and the new tab becomes the
// endpoint. This also means signaling can target the one participating socket,
// not every tab the user has open.
//
// In-process only: rooms are per-instance and would not span a multi-node deploy
// (see brain/features/voice-chat.md). Matches the rest of the hub.

// A socket identity. The hub passes its LiveSubscriber; tests pass plain objects.
export type VoiceToken = object

// roomKey -> (userId -> the one socket representing that user in the room).
const rooms = new Map<string, Map<string, VoiceToken>>()
// token -> the room + user it is the endpoint for, so disconnect/leave is O(1)
// without scanning every room. Kept in lockstep with `rooms`.
const membership = new Map<VoiceToken, { roomKey: string; userId: string }>()

function removeFromRoom(roomKey: string, userId: string): void {
  // Invariant: every caller passes a roomKey that currently has a userMap - a
  // membership entry always implies its room exists (the two maps are mutated
  // together) - so the map is present here.
  const userMap = rooms.get(roomKey)!
  userMap.delete(userId)
  // Drop empty rooms so an ended call frees its slot (ephemeral lifecycle).
  if (userMap.size === 0) rooms.delete(roomKey)
}

export interface VoiceJoinResult {
  // Every userId now in the room, including the joiner - the mesh roster the
  // joiner connects out to and existing members add.
  roster: string[]
  // A prior socket of the SAME user in this room, displaced by this join (a second
  // tab taking the call over). The hub tells it to tear its call down. Null when
  // the user was not already in from another tab.
  evicted: VoiceToken | null
}

// Put a socket into a room as the given user's endpoint. Idempotent for the same
// (token, room, user). A different token for a user already in the room evicts the
// old one (tab takeover); a token already in another room leaves that first (a
// socket is in at most one call).
export function joinRoom(token: VoiceToken, roomKey: string, userId: string): VoiceJoinResult {
  const existing = membership.get(token)
  if (existing) {
    if (existing.roomKey === roomKey && existing.userId === userId) {
      return { roster: [...rooms.get(roomKey)!.keys()], evicted: null }
    }
    // Same socket, different room/identity: leave the old room before re-homing.
    removeFromRoom(existing.roomKey, existing.userId)
    membership.delete(token)
  }

  let userMap = rooms.get(roomKey)
  if (!userMap) {
    userMap = new Map<string, VoiceToken>()
    rooms.set(roomKey, userMap)
  }

  const prior = userMap.get(userId)
  const evicted = prior && prior !== token ? prior : null
  if (evicted) membership.delete(evicted)

  userMap.set(userId, token)
  membership.set(token, { roomKey, userId })
  return { roster: [...userMap.keys()], evicted }
}

export interface VoiceLeaveResult {
  roomKey: string
  userId: string
  // The roster left behind, so the hub pushes the updated set to the remainers.
  roster: string[]
}

// Remove a socket from its room. Returns what it left (for the hub's fan-out) or
// null if it was in no room. A token that still has a membership entry is by
// definition that user's current endpoint (eviction and room-moves delete the old
// token's membership), so it is safe to clear the slot unconditionally.
export function leaveRoom(token: VoiceToken): VoiceLeaveResult | null {
  const m = membership.get(token)
  membership.delete(token)
  if (!m) return null
  removeFromRoom(m.roomKey, m.userId)
  return { roomKey: m.roomKey, userId: m.userId, roster: [...(rooms.get(m.roomKey)?.keys() ?? [])] }
}

// The user's participating socket in a room, for targeted signaling relay - a
// voice frame reaches only the tab in the call, not every tab the user has open.
export function tokenInRoom(roomKey: string, userId: string): VoiceToken | undefined {
  return rooms.get(roomKey)?.get(userId)
}

// Whether a user currently has an endpoint in the room (relay authz: both peers
// of a signal must be in the same room).
export function isInRoom(roomKey: string, userId: string): boolean {
  return rooms.get(roomKey)?.has(userId) ?? false
}

// The userIds currently in a room.
export function rosterOf(roomKey: string): string[] {
  return [...(rooms.get(roomKey)?.keys() ?? [])]
}

// The participating sockets in a room, for the hub to fan a roster update to.
export function tokensInRoom(roomKey: string): VoiceToken[] {
  return [...(rooms.get(roomKey)?.values() ?? [])]
}

// The room a socket is the endpoint for, or null.
export function roomOf(token: VoiceToken): { roomKey: string; userId: string } | null {
  return membership.get(token) ?? null
}

// Exposed for tests: drop all room state.
export function __resetVoiceRooms(): void {
  rooms.clear()
  membership.clear()
}
