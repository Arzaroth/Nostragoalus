// Voice-chat wire types, shared by the WS signaling on both ends and the client
// composable. Media is peer-to-peer WebRTC (DTLS-SRTP); these frames only carry
// call control + the SDP/ICE the browsers exchange to connect. The server relays
// signaling and owns room membership, never the audio.

// A call's scope, mirroring a chat message's scope: a 1:1 DM thread, or a league
// room (optionally a per-match room within the league).
export type VoiceScope =
  | { kind: 'dm'; threadId: string }
  | { kind: 'league'; leagueId: string; matchId: string | null }

// The in-process room key a scope maps to. Derived server-side from the validated
// scope (never trusted from the client) and used by the hub + voice-rooms.
export function voiceRoomKey(scope: VoiceScope): string {
  if (scope.kind === 'dm') return `dm:${scope.threadId}`
  return scope.matchId ? `league:${scope.leagueId}:match:${scope.matchId}` : `league:${scope.leagueId}`
}

// The inverse of voiceRoomKey, for the fan-out paths that only carry a room key
// (a leave / disconnect) and need to name the scope in the frame. Returns null for
// a malformed key.
export function parseVoiceRoomKey(roomKey: string): VoiceScope | null {
  const parts = roomKey.split(':')
  if (parts[0] === 'dm' && parts.length === 2) return { kind: 'dm', threadId: parts[1] }
  if (parts[0] === 'league' && parts.length === 2) return { kind: 'league', leagueId: parts[1], matchId: null }
  if (parts[0] === 'league' && parts.length === 4 && parts[2] === 'match') {
    return { kind: 'league', leagueId: parts[1], matchId: parts[3] }
  }
  return null
}

export type VoiceSignalKind = 'offer' | 'answer' | 'ice'

// Validate an untrusted scope from a client frame into a VoiceScope, or null. Ids
// are short uuids; an over-long or wrong-shaped value is rejected so a hostile
// frame cannot mint a giant room key or a malformed scope.
export function parseVoiceScope(raw: unknown): VoiceScope | null {
  if (typeof raw !== 'object' || raw === null) return null
  const s = raw as Record<string, unknown>
  const ok = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64
  if (s.kind === 'dm') return ok(s.threadId) ? { kind: 'dm', threadId: s.threadId } : null
  if (s.kind === 'league') {
    if (!ok(s.leagueId)) return null
    const matchId = s.matchId == null ? null : ok(s.matchId) ? s.matchId : undefined
    return matchId === undefined ? null : { kind: 'league', leagueId: s.leagueId, matchId }
  }
  return null
}

// === Client -> server frames (inbound on /_ws) ===

// Join (or open) the call for a scope. The caller of a DM, a DM callee accepting,
// a league member joining, or an invitee accepting all send this.
export interface VoiceJoinFrame {
  type: 'voice:join'
  scope: VoiceScope
}
// Leave whatever call this socket is in.
export interface VoiceLeaveFrame {
  type: 'voice:leave'
}
// Relay one SDP/ICE payload to another participant of the same room.
export interface VoiceSignalFrame {
  type: 'voice:signal'
  to: string
  kind: VoiceSignalKind
  payload: unknown
}
// Ring specific users into a scope (a DM caller rings the other; an in-call league
// member invites chosen members). Server authorizes each target for the scope.
export interface VoiceInviteFrame {
  type: 'voice:invite'
  scope: VoiceScope
  userIds: string[]
}
// Decline a ring (relayed to the inviter; no missed-call recorded).
export interface VoiceDeclineFrame {
  type: 'voice:decline'
  scope: VoiceScope
  to: string
}
// Cancel an outgoing DM ring before it is answered - marks it a missed call for
// the callee and dismisses their ring.
export interface VoiceCancelFrame {
  type: 'voice:cancel'
  scope: VoiceScope
  to: string
}

export type VoiceInboundFrame =
  | VoiceJoinFrame
  | VoiceLeaveFrame
  | VoiceSignalFrame
  | VoiceInviteFrame
  | VoiceDeclineFrame
  | VoiceCancelFrame

// === Server -> client frames (outbound) ===

// The full roster of a room after a join/leave - the mesh membership (user ids)
// the client reconciles its peer connections against, plus the display names the
// UI shows (a DM has no client-side roster to resolve names from).
export interface VoiceRosterFrame {
  type: 'voice:roster'
  roomKey: string
  scope: VoiceScope
  roster: string[]
  names: Record<string, string>
}
// A league voice room's participant count, broadcast to every league member (not
// just participants) so the chat can show an always-on "N in voice" badge (with
// who is in) and an invite affordance. count 0 = the room emptied (clear the badge).
export interface VoicePresenceFrame {
  type: 'voice:presence'
  roomKey: string
  scope: VoiceScope
  count: number
  names: Record<string, string>
}
// An incoming ring for the recipient.
export interface VoiceRingFrame {
  type: 'voice:ring'
  scope: VoiceScope
  from: string
  fromName: string
}
// A relayed signal from another participant.
export interface VoiceSignalInbound {
  type: 'voice:signal'
  from: string
  kind: VoiceSignalKind
  payload: unknown
}
// The other party declined / the caller cancelled / you were displaced by another
// tab / the call ended (the other DM party left) - a terminal control frame the
// client acts on (dismiss ring, drop call).
export interface VoiceControlFrame {
  type: 'voice:declined' | 'voice:cancelled' | 'voice:evicted' | 'voice:ended'
  scope: VoiceScope
  from: string
}
// A participant re-joined from a new tab (a takeover): the roster userIds are
// unchanged, so the other members are told to drop and re-establish their peer
// connection to that user - otherwise they keep a dead link to the old tab.
export interface VoicePeerResetFrame {
  type: 'voice:peer-reset'
  userId: string
}

// What the ICE-servers endpoint returns: STUN always, TURN when coturn is
// configured (ephemeral, time-limited credentials).
export interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}
export interface IceServersResponse {
  iceServers: IceServer[]
  // Seconds the TURN credential stays valid; the client refetches before it lapses.
  ttl: number
}
