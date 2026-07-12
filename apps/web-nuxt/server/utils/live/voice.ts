import type { AppDatabase } from '../../../db/types'
import type { LiveSubscriber } from './hub'
import { publishVoiceLog, publishVoicePresence, publishVoiceRoster, publishVoiceToUser, sendVoiceToToken } from './hub'
import { isInRoom, joinRoom, leaveRoom, roomOf, rosterOf, tokenInRoom, tokensInRoom } from './voice-rooms'
import {
  addCallParticipant,
  closeCallLog,
  openCallLog,
  recordMissedCall,
  resolveVoiceScope,
  scopeAudience,
} from '../voice/service'
import type { VoiceScopeMeta } from '../voice/service'
import { getLeagueMemberIds } from '../chat/service'
import { displayName, displayNames } from '../notifications/events'
import type { VoiceScope, VoiceSignalKind } from '../../../shared/types/voice'
import { parseVoiceRoomKey } from '../../../shared/types/voice'

// Broadcast a league room's live participant count to every league member, so the
// "N in voice" badge shows even to non-participants. DM rooms need no badge, so
// this is a no-op for them. `members` lets the join path pass the member list it
// already fetched (resolveVoiceScope), avoiding a second identical query.
async function broadcastLeaguePresence(
  db: AppDatabase,
  roomKey: string,
  scope: VoiceScope,
  members?: readonly string[],
  names?: Record<string, string>,
): Promise<void> {
  if (scope.kind !== 'league') return
  const recipients = members ?? (await getLeagueMemberIds(db, scope.leagueId))
  const roster = rosterOf(roomKey)
  const rosterNames = names ?? (await displayNames(db, roster))
  publishVoicePresence(recipients, { type: 'voice:presence', roomKey, scope, count: roster.length, names: rosterNames })
}

// roomKey -> the ONGOING voice_call row backing the live room, for the chat call
// log. In-process like the rooms themselves; a restart mid-call orphans the row
// exactly as it drops the room (accepted, same as the rest of the hub). The value
// is the open's promise (null = the open failed), stored before it settles so two
// concurrent joins share one row instead of each inserting their own.
const callLogByRoom = new Map<string, Promise<string | null>>()

// Exposed for tests.
export function __resetVoiceCallLog(): void {
  callLogByRoom.clear()
}

// Tell a scope's audience the call log changed, so open chats refetch their call
// lines. The frame carries the scope flattened, matching the chat composables'
// per-room frame gating.
async function publishCallLogChanged(db: AppDatabase, scope: VoiceScope, audience?: readonly string[]): Promise<void> {
  const recipients = audience ?? (await scopeAudience(db, scope))
  const frame =
    scope.kind === 'dm'
      ? { type: 'voice:log', threadId: scope.threadId }
      : { type: 'voice:log', leagueId: scope.leagueId, matchId: scope.matchId }
  publishVoiceLog(recipients, frame)
}

// Open/append/close the persistent call-log row as the live room changes. A
// league room logs from its first join; a DM only once both parties connected
// (an unanswered ring is the missed-call path, not a call).
async function trackJoinInCallLog(db: AppDatabase, roomKey: string, scope: VoiceScope, meta: VoiceScopeMeta, userId: string): Promise<void> {
  const roster = rosterOf(roomKey)
  const existing = callLogByRoom.get(roomKey)
  if (existing) {
    const callId = await existing
    if (callId) await addCallParticipant(db, callId, userId)
    return
  }
  if (scope.kind !== 'league' && roster.length < 2) return
  // Map insertion order: the first roster entry is the caller.
  const initiatorId = scope.kind === 'league' ? userId : roster[0]!
  const opening = (async () => {
    try {
      return await openCallLog(db, meta, initiatorId, roster)
    } catch {
      // A failed open frees the slot so a later join can retry - unless the slot
      // was already recycled (the room emptied) while this insert was pending.
      if (callLogByRoom.get(roomKey) === opening) callLogByRoom.delete(roomKey)
      return null
    }
  })()
  // Set BEFORE the first await settles: a concurrent second join must find the
  // pending open and append to it, not insert a duplicate ONGOING row.
  callLogByRoom.set(roomKey, opening)
  if ((await opening) === null) return
  await publishCallLogChanged(db, scope)
}

async function closeCallLogIfEmpty(db: AppDatabase, roomKey: string, scope: VoiceScope): Promise<void> {
  if (rosterOf(roomKey).length > 0) return
  const pending = callLogByRoom.get(roomKey)
  if (!pending) return
  callLogByRoom.delete(roomKey)
  const callId = await pending
  // A null settled open never wrote a row, so there is nothing to close.
  if (!callId) return
  await closeCallLog(db, callId)
  await publishCallLogChanged(db, scope)
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
  // A socket hopping rooms leaves its old room inside joinRoom, bypassing
  // handleVoiceLeave - note the old room so its log can still be closed.
  const prior = roomOf(sub)
  const { evicted } = joinRoom(sub, resolved.roomKey, sub.userId)
  if (evicted) {
    // A second tab took the call over. Tell the displaced tab to drop, and tell
    // the OTHER participants to reset their peer connection to this user - the
    // roster userIds did not change on a takeover, so without this they would keep
    // a dead link to the old tab and never reconnect to the new one.
    sendVoiceToToken(evicted, { type: 'voice:evicted', scope, from: sub.userId })
    for (const token of tokensInRoom(resolved.roomKey)) {
      if (token !== sub) sendVoiceToToken(token, { type: 'voice:peer-reset', userId: sub.userId })
    }
  }
  const names = await displayNames(db, rosterOf(resolved.roomKey))
  publishVoiceRoster(resolved.roomKey, scope, names)
  await broadcastLeaguePresence(db, resolved.roomKey, scope, resolved.audience, names)
  await trackJoinInCallLog(db, resolved.roomKey, scope, resolved.meta, sub.userId)
  if (prior && prior.roomKey !== resolved.roomKey) {
    const priorScope = parseVoiceRoomKey(prior.roomKey)
    if (priorScope) await closeCallLogIfEmpty(db, prior.roomKey, priorScope)
  }
}

// Leave whatever call this socket is in (an explicit leave or a disconnect): push
// the reduced roster to the remainers and update the league "N in voice" badge.
// No-op if the socket is in no call.
export async function handleVoiceLeave(db: AppDatabase, sub: LiveSubscriber): Promise<void> {
  const left = leaveRoom(sub)
  if (!left) return
  // The room key was built from a validated scope on join, so it always parses.
  const scope = parseVoiceRoomKey(left.roomKey)!
  // A DM is a two-party call: one side leaving ends it for the other too. Drop the
  // remainer from the room and tell them, instead of stranding them in a zombie
  // "in-call" state with no peer.
  if (scope.kind === 'dm') {
    for (const token of tokensInRoom(left.roomKey)) {
      leaveRoom(token)
      sendVoiceToToken(token, { type: 'voice:ended', scope, from: left.userId })
    }
  }
  const names = await displayNames(db, rosterOf(left.roomKey))
  publishVoiceRoster(left.roomKey, scope, names)
  await broadcastLeaguePresence(db, left.roomKey, scope, undefined, names)
  await closeCallLogIfEmpty(db, left.roomKey, scope)
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
      await publishCallLogChanged(db, scope, resolved.audience)
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
// timed out). The callee's ring is dismissed; if they were online and never joined
// it is logged as a missed call for them (bell + push). Authorized like an invite
// so the missed-call path cannot be abused.
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
  // Dismiss the ring on the callee's devices. Record the miss only when a socket
  // of theirs actually got the ring (online, then unanswered): an offline callee
  // received no ring, and `handleVoiceInvite` already logged that miss when the
  // invite failed to deliver - recording again here would double the history row.
  const delivered = publishVoiceToUser(to, { type: 'voice:cancelled', scope, from: sub.userId })
  if (delivered > 0) {
    await recordMissedCall(db, { meta: resolved.meta, callerId: sub.userId, targetId: to })
    await publishCallLogChanged(db, scope, resolved.audience)
  }
}
