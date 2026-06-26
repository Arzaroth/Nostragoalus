import { inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'
import type { NotificationDTO } from '../../../shared/types/notifications'
import type { ReactionTotals } from '../../../shared/reactions'
import type { ChatAttachmentDTO, ChatMessageDTO } from '../../../shared/types/chat'

export interface LiveSubscriber {
  matchIds: Set<string>
  // Resolved from the session cookie at WS open; null for guests. Lets
  // league-scoped pushes go to members only.
  userId?: string | null
  send: (payload: unknown) => void
}

// In-process registry of connected live subscribers (single long-running server).
const subscribers = new Set<LiveSubscriber>()

export function addLiveSubscriber(sub: LiveSubscriber): void {
  subscribers.add(sub)
}

export function removeLiveSubscriber(sub: LiveSubscriber): void {
  subscribers.delete(sub)
}

export function liveSubscriberCount(): number {
  return subscribers.size
}

const liveColumns = {
  id: match.id,
  status: match.status,
  fullTimeHome: match.fullTimeHome,
  fullTimeAway: match.fullTimeAway,
  winner: match.winner,
  kickoffTime: match.kickoffTime,
}

// A prediction changed: broadcast the new crowd totals for that match to every
// connected client (the client ignores it unless the preference is on).
export function publishCrowdUpdate(matchId: string, totals: { home: number; away: number; count: number }): number {
  let delivered = 0
  for (const sub of subscribers) {
    sub.send({ type: 'crowd:update', matchId, totals })
    delivered += 1
  }
  return delivered
}

// League crowd totals are gated data (private leagues): deliver only to the
// league's members, however many connections each of them has open.
export function publishLeagueCrowdUpdate(
  leagueId: string,
  memberIds: readonly string[],
  matchId: string,
  totals: { home: number; away: number; count: number },
): number {
  const members = new Set(memberIds)
  let delivered = 0
  for (const sub of subscribers) {
    if (sub.userId && members.has(sub.userId)) {
      // Distinct type so a pre-deploy client (which treats any crowd:update with
      // a matchId as global) can't fold league totals into its global map.
      sub.send({ type: 'crowd:league-update', leagueId, matchId, totals })
      delivered += 1
    }
  }
  return delivered
}

// A reaction changed: broadcast the match's new per-emoji counts to every
// connected client. Mirrors publishCrowdUpdate - the client patches it only
// when it's the match it's viewing.
export function publishReactionUpdate(matchId: string, totals: ReactionTotals): number {
  let delivered = 0
  for (const sub of subscribers) {
    sub.send({ type: 'reaction:update', matchId, totals })
    delivered += 1
  }
  return delivered
}

// League-scoped reaction counts are members-only (private leagues): deliver to
// that league's connected members alone, with a distinct type so a global
// patch handler can't fold them into the global counts.
export function publishLeagueReactionUpdate(
  leagueId: string,
  memberIds: readonly string[],
  matchId: string,
  totals: ReactionTotals,
): number {
  const members = new Set(memberIds)
  let delivered = 0
  for (const sub of subscribers) {
    if (sub.userId && members.has(sub.userId)) {
      sub.send({ type: 'reaction:league-update', leagueId, matchId, totals })
      delivered += 1
    }
  }
  return delivered
}

// Deliver one payload to every connected socket whose user is in `memberIds`,
// guarding each send so a single socket mid-close (which throws synchronously)
// cannot abort the fan-out to the rest. Returns how many sockets received it.
// This members-only gate is the privacy boundary for every chat/league push, so
// it lives in exactly one place.
function deliverToMembers(memberIds: readonly string[], payload: unknown): number {
  const members = new Set(memberIds)
  let delivered = 0
  for (const sub of subscribers) {
    if (sub.userId && members.has(sub.userId)) {
      try {
        sub.send(payload)
        delivered += 1
      } catch {
        // socket is closing/closed; skip it and keep delivering to the others
      }
    }
  }
  return delivered
}

// A new encrypted chat message: deliver the ciphertext to the league's connected
// members only (private leagues). The payload is opaque to the server.
export function publishLeagueChatMessage(
  leagueId: string,
  memberIds: readonly string[],
  message: ChatMessageDTO,
): number {
  return deliverToMembers(memberIds, { type: 'chat:new', leagueId, message })
}

// A member is missing the current group key (just joined, or a stuck wrap):
// nudge the league's connected members to re-seal. The payload carries no key
// material, only a prompt - just a keyholding client can act on it. Mirrors the
// chat:new members-only gate so non-members never learn a league exists.
export function publishChatRekeyRequest(leagueId: string, memberIds: readonly string[]): number {
  return deliverToMembers(memberIds, { type: 'chat:rekey-request', leagueId })
}

// A keyholder just sealed the group key for these members: tell each of them to
// reload so their client opens the new wrap (clears the "waiting for a key"
// state). Delivered only to the named recipients' own sockets.
export function publishChatKeysAdded(leagueId: string, recipientIds: readonly string[]): number {
  return deliverToMembers(recipientIds, { type: 'chat:keys-added', leagueId })
}

// Chat was turned on/off or re-keyed: nudge the league's connected members to
// reload, so the change (the dock appearing/disappearing, a fresh key epoch)
// reflects live instead of waiting for a refresh. Carries no key material.
export function publishChatStateChanged(leagueId: string, memberIds: readonly string[]): number {
  return deliverToMembers(memberIds, { type: 'chat:state-changed', leagueId })
}

// A message's reaction counts changed: push the new per-emoji totals to that
// league's connected members (members-only, like the messages themselves). The
// emoji counts are plaintext; the message content stays opaque.
export function publishChatReactionUpdate(
  leagueId: string,
  memberIds: readonly string[],
  messageId: string,
  totals: ReactionTotals,
): number {
  return deliverToMembers(memberIds, { type: 'chat:reaction', leagueId, messageId, totals })
}

// A message's moderation state changed (auto-pending, removed or restored): tell
// the league's connected members so they hide/tombstone or reveal it live. No
// content travels - clients that lack it refetch.
export function publishChatModeration(
  leagueId: string,
  memberIds: readonly string[],
  messageId: string,
  state: 'VISIBLE' | 'PENDING' | 'REMOVED',
): number {
  return deliverToMembers(memberIds, { type: 'chat:moderation', leagueId, messageId, state })
}

// A message was edited by its author: push the new ciphertext + edit time to the
// league's connected members so they re-decrypt it in place. The content stays
// opaque to the server.
export function publishChatEdit(
  leagueId: string,
  memberIds: readonly string[],
  messageId: string,
  ciphertext: string,
  editedAt: string,
  attachments: ChatAttachmentDTO[],
): number {
  return deliverToMembers(memberIds, { type: 'chat:edit', leagueId, messageId, ciphertext, editedAt, attachments })
}

// Deliver a freshly created notification to every open socket of that one user
// (mirrors the league-member gate above). Other users' sockets never see it, so
// the bell can render it live without a refetch.
export function publishUserNotification(userId: string, notification: NotificationDTO): number {
  let delivered = 0
  for (const sub of subscribers) {
    if (sub.userId === userId) {
      sub.send({ type: 'notification:new', notification })
      delivered += 1
    }
  }
  return delivered
}

// Push the current state of the given matches to every subscriber watching them.
export async function publishMatchUpdates(db: AppDatabase, matchIds: string[]): Promise<number> {
  if (matchIds.length === 0 || subscribers.size === 0) return 0

  const rows = await db.select(liveColumns).from(match).where(inArray(match.id, matchIds))
  let delivered = 0
  for (const row of rows) {
    for (const sub of subscribers) {
      if (sub.matchIds.has(row.id)) {
        sub.send({ type: 'match:update', match: row })
        delivered += 1
      }
    }
  }
  // A score moved somewhere: nudge every client to refetch derived views
  // (provisional standings) without each having to subscribe to match ids.
  for (const sub of subscribers) sub.send({ type: 'scores:changed' })
  return delivered
}

// On (re)subscribe, push the current state of the subscribed matches to that one
// client so it converges to truth. Live transitions (kickoff, full-time) are
// broadcast once; a client that was disconnected or had not subscribed yet would
// otherwise keep its stale state until a full reload.
export async function sendMatchSnapshot(db: AppDatabase, sub: LiveSubscriber): Promise<number> {
  const ids = [...sub.matchIds]
  if (ids.length === 0) return 0
  const rows = await db.select(liveColumns).from(match).where(inArray(match.id, ids))
  for (const row of rows) sub.send({ type: 'match:update', match: row })
  return rows.length
}
