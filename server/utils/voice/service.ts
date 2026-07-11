import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition, league, match, voiceCall } from '../../../db/schema'
import type { IceServer, IceServersResponse, VoiceScope } from '../../../shared/types/voice'
import { voiceRoomKey } from '../../../shared/types/voice'
import { ForbiddenError, NotFoundError, ValidationError } from '../errors'
import { getLeagueMemberIds } from '../chat/service'
import { getMembership } from '../leagues/service'
import { requireParticipant } from '../dm/service'
import { displayName } from '../notifications/events'
import { createNotification } from '../notifications/service'

// The context a resolved scope carries for the missed-call notification. Exactly
// one shape, mirroring the call's scope.
export type VoiceScopeMeta =
  | { kind: 'dm'; threadId: string }
  | { kind: 'league'; leagueId: string; leagueName: string; competitionSlug: string; matchId: string | null }

export interface ResolvedVoiceScope {
  roomKey: string
  // Every user allowed in this call - the DM pair, or the league's members. Used
  // to authorize ring targets; signal relay is authorized separately by live room
  // membership (both peers must currently be in the room).
  audience: string[]
  meta: VoiceScopeMeta
}

// Authorize `userId` to open/join a call in `scope`, and resolve its room key,
// audience and notification metadata. Throws (NotFound / Forbidden / Validation)
// when the user may not, mirroring the chat authorization - a DM needs the caller
// to be a thread participant; a league call needs membership and chat (hence
// voice) enabled, and a match-scoped room needs the match to be in the league's
// competition. The room key is derived here, never trusted from the client.
export async function resolveVoiceScope(db: AppDatabase, userId: string, scope: VoiceScope): Promise<ResolvedVoiceScope> {
  if (scope.kind === 'dm') {
    const t = await requireParticipant(db, scope.threadId, userId)
    return { roomKey: voiceRoomKey(scope), audience: [t.userAId, t.userBId], meta: { kind: 'dm', threadId: scope.threadId } }
  }

  const membership = await getMembership(db, scope.leagueId, userId)
  // A non-member gets the same 404 a scoped read would, so a call can't probe a
  // private league's existence.
  if (!membership) throw new NotFoundError('league not found')
  const rows = await db
    .select({
      chatEnabled: league.chatEnabled,
      leagueName: league.name,
      competitionId: league.competitionId,
      competitionSlug: competition.slug,
    })
    .from(league)
    .innerJoin(competition, eq(competition.id, league.competitionId))
    .where(eq(league.id, scope.leagueId))
    .limit(1)
  // The membership check above already proved the league (and, via its FK, the
  // competition) exists, so the innerJoin returns a row.
  const lg = rows[0]!
  // Voice piggybacks on the chat toggle: no chat, no calls.
  if (!lg.chatEnabled) throw new ForbiddenError('voice is not enabled for this league')
  if (scope.matchId) {
    const m = await db.select({ competitionId: match.competitionId }).from(match).where(eq(match.id, scope.matchId)).limit(1)
    if (m.length === 0 || m[0].competitionId !== lg.competitionId) {
      throw new ValidationError('match is not in this league competition')
    }
  }
  const audience = await getLeagueMemberIds(db, scope.leagueId)
  return {
    roomKey: voiceRoomKey(scope),
    audience,
    meta: {
      kind: 'league',
      leagueId: scope.leagueId,
      leagueName: lg.leagueName,
      competitionSlug: lg.competitionSlug,
      matchId: scope.matchId,
    },
  }
}

// Record a missed voice call: a light history row plus the VOICE_MISSED
// notification (which fans out over the WS bell and best-effort web push, gated on
// the recipient's "calls" toggle). The dedupe key collapses repeated unanswered
// rings from the same caller in the same room into one freshly-unread entry.
export async function recordMissedCall(
  db: AppDatabase,
  opts: { meta: VoiceScopeMeta; callerId: string; targetId: string },
): Promise<void> {
  const { meta, callerId, targetId } = opts
  const callerName = await displayName(db, callerId)
  const now = new Date()

  await db.insert(voiceCall).values(
    meta.kind === 'dm'
      ? { dmThreadId: meta.threadId, initiatorId: callerId, status: 'MISSED', participantIds: [callerId], endedAt: now }
      : { leagueId: meta.leagueId, matchId: meta.matchId, initiatorId: callerId, status: 'MISSED', participantIds: [callerId], endedAt: now },
  )

  await createNotification(db, {
    userId: targetId,
    data:
      meta.kind === 'dm'
        ? {
            type: 'VOICE_MISSED',
            callerId,
            callerName,
            threadId: meta.threadId,
            leagueId: null,
            leagueName: null,
            competitionSlug: null,
            matchId: null,
          }
        : {
            type: 'VOICE_MISSED',
            callerId,
            callerName,
            threadId: null,
            leagueId: meta.leagueId,
            leagueName: meta.leagueName,
            competitionSlug: meta.competitionSlug,
            matchId: meta.matchId,
          },
    dedupeKey:
      meta.kind === 'dm'
        ? `call:${meta.threadId}:${callerId}`
        : `call:${meta.leagueId}:${meta.matchId ?? 'global'}:${callerId}`,
    refresh: true,
  })
}

export interface TurnConfig {
  secret: string
  host: string
  realm: string
}

// A coturn ephemeral credential (the TURN REST `use-auth-secret` scheme): the
// username is `<expiry-unix>:<userId>` and the credential is the base64 HMAC-SHA1
// of that username under the shared secret. coturn recomputes the same HMAC and
// accepts it until the embedded expiry, with no stored per-user account, so the
// secret itself never reaches the browser.
export function turnCredential(
  secret: string,
  userId: string,
  ttlSeconds: number,
  nowMs: number,
): { username: string; credential: string } {
  const expiry = Math.floor(nowMs / 1000) + ttlSeconds
  const username = `${expiry}:${userId}`
  const credential = createHmac('sha1', secret).update(username).digest('base64')
  return { username, credential }
}

// Build the ICE server list handed to the browser. A public STUN server is always
// present as a floor; TURN is added only when coturn is configured, each URL
// carrying a fresh ephemeral credential. Without TURN, a call behind symmetric NAT
// cannot relay and will fail to connect - the client surfaces that state.
export function buildIceServers(
  turn: Partial<TurnConfig> | null | undefined,
  userId: string,
  nowMs: number,
  ttlSeconds = 3600,
): IceServersResponse {
  const iceServers: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
  if (turn?.secret && turn.host) {
    const { username, credential } = turnCredential(turn.secret, userId, ttlSeconds, nowMs)
    iceServers.push(
      { urls: `turn:${turn.host}:3478?transport=udp`, username, credential },
      { urls: `turn:${turn.host}:3478?transport=tcp`, username, credential },
      { urls: `turns:${turn.host}:5349?transport=tcp`, username, credential },
    )
  }
  return { iceServers, ttl: ttlSeconds }
}
