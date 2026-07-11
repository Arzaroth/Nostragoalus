import type { AppDatabase } from '../../../db/types'
import type { LiveSubscriber } from './hub'
import { publishVoicePresence, publishVoiceRoster, publishVoiceToUser, sendVoiceToToken } from './hub'
import { isInRoom, joinRoom, leaveRoom, roomOf, rosterOf, tokenInRoom } from './voice-rooms'
import { recordMissedCall, resolveVoiceScope } from '../voice/service'
import { getLeagueMemberIds } from '../chat/service'
import { displayName } from '../notifications/events'
import type { VoiceScope, VoiceSignalKind } from '../../../shared/types/voice'
import { parseVoiceRoomKey } from '../../../shared/types/voice'

// Broadcast a league room's live participant count to every league member, so the
// "N in voice" badge shows even to non-participants. DM rooms need no badge, so
// this is a no-op for them.
async function broadcastLeaguePresence(db: AppDatabase, roomKey: string, scope: VoiceScope): Promise<void> {
  if (scope.kind !== 'league') return
  const members = await getLeagueMemberIds(db, scope.leagueId)
  publishVoicePresence(members, { type: 'voice:presence', roomKey, scope, count: rosterOf(roomKey).length })
}

// The WS-frame orchestration for voice: authorize (reusing chat/DM rules), mutate
// the in-process rooms and fan the right frames out. `_ws.ts` calls these; the
// low-level sends live in hub.ts and the room bookkeeping in voice-rooms.ts. A
// socket authenticates once at WS open, so `sub.userId` is trusted here.

// Join or open the call for a scope. Authorizes the caller, seats this socket as
// the user's single endpoint (evicting a prior tab of theirs, which is told to
// drop its call), and pushes the new roster to the whole room.
export async function handleVoiceJoin(db: AppDatabase, sub: LiveSubscriber, scope: VoiceScope): Promise<void> {
  if (!sub.userId) return
  const resolved = await resolveVoiceScope(db, sub.userId, scope)
  const { evicted } = joinRoom(sub, resolved.roomKey, sub.userId)
  if (evicted) sendVoiceToToken(evicted, { type: 'voice:evicted', scope, from: sub.userId })
  publishVoiceRoster(resolved.roomKey, scope)
  await broadcastLeaguePresence(db, resolved.roomKey, scope)
}

// Leave whatever call this socket is in (an explicit leave or a disconnect): push
// the reduced roster to the remainers and update the league "N in voice" badge.
// No-op if the socket is in no call.
export async function handleVoiceLeave(db: AppDatabase, sub: LiveSubscriber): Promise<void> {
  const left = leaveRoom(sub)
  if (!left) return
  // The room key was built from a validated scope on join, so it always parses.
  const scope = parseVoiceRoomKey(left.roomKey)!
  publishVoiceRoster(left.roomKey, scope)
  await broadcastLeaguePresence(db, left.roomKey, scope)
}

// Relay one SDP/ICE payload to another participant. Authorized purely by live
// membership: the sender must be in a room and the target must be in the SAME room
// (both were authorized when they joined), so there is no per-signal DB hit and no
// way to push signaling at a user who is not in the call.
export function handleVoiceSignal(sub: LiveSubscriber, to: string, kind: VoiceSignalKind, payload: unknown): void {
  if (!sub.userId) return
  const room = roomOf(sub)
  if (!room) return
  const targetToken = tokenInRoom(room.roomKey, to)
  if (!targetToken) return
  sendVoiceToToken(targetToken, { type: 'voice:signal', from: sub.userId, kind, payload })
}

// Ring specific users into a scope (a DM caller rings the one other; an in-call
// league member invites chosen members). Authorizes the caller for the scope, then
// rings each target that belongs to it. A target with no open socket is offline, so
// it is recorded as a missed call immediately (bell + push) rather than ringing
// into the void.
export async function handleVoiceInvite(
  db: AppDatabase,
  sub: LiveSubscriber,
  scope: VoiceScope,
  userIds: string[],
): Promise<void> {
  if (!sub.userId) return
  const resolved = await resolveVoiceScope(db, sub.userId, scope)
  const fromName = await displayName(db, sub.userId)
  const targets = [...new Set(userIds)].filter((id) => id !== sub.userId && resolved.audience.includes(id))
  for (const target of targets) {
    const delivered = publishVoiceToUser(target, { type: 'voice:ring', scope, from: sub.userId, fromName })
    if (delivered === 0) {
      await recordMissedCall(db, { meta: resolved.meta, callerId: sub.userId, targetId: target })
    }
  }
}

// The recipient of a ring declines: tell the inviter so their outgoing-call UI
// clears. Authorized so a stranger cannot spam "declined" frames - the decliner
// must be in the scope and the target within its audience. No missed call: a
// decline is an explicit answer, not a miss.
export async function handleVoiceDecline(
  db: AppDatabase,
  sub: LiveSubscriber,
  scope: VoiceScope,
  to: string,
): Promise<void> {
  if (!sub.userId) return
  const resolved = await resolveVoiceScope(db, sub.userId, scope)
  if (!resolved.audience.includes(to)) return
  publishVoiceToUser(to, { type: 'voice:declined', scope, from: sub.userId })
}

// The caller cancels an outgoing ring before it is answered (hung up, or the ring
// timed out). If the callee never joined the room it is a missed call for them
// (bell + push) and their ring is dismissed. Authorized like an invite so the
// missed-call path cannot be abused.
export async function handleVoiceCancel(
  db: AppDatabase,
  sub: LiveSubscriber,
  scope: VoiceScope,
  to: string,
): Promise<void> {
  if (!sub.userId) return
  const resolved = await resolveVoiceScope(db, sub.userId, scope)
  if (!resolved.audience.includes(to)) return
  if (isInRoom(resolved.roomKey, to)) return
  await recordMissedCall(db, { meta: resolved.meta, callerId: sub.userId, targetId: to })
  publishVoiceToUser(to, { type: 'voice:cancelled', scope, from: sub.userId })
}
