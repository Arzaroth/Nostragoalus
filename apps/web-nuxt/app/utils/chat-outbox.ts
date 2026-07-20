import { emptyReactionTotals } from '#shared/reactions'
import type { DecryptedMessage, SendOptions } from '~/composables/useLeagueChat'

// The outbox: what a chat room shows between "the user hit send" and "the server
// acknowledged it". A local stand-in goes into the list right away so the message
// never vanishes, then it is settled against the server row - or, if the POST never
// made it, kept aside as a failed bubble the author can retry or discard.

let localSendSeq = 0

export function makePendingMessage(
  userId: string | null,
  text: string,
  ctx: { matchId?: string | null; parentId?: string | null; threadId?: string | null; images?: number },
): DecryptedMessage {
  return {
    id: `local-${++localSendSeq}`,
    userId,
    matchId: ctx.matchId ?? null,
    parentId: ctx.parentId ?? null,
    threadId: ctx.threadId ?? null,
    text,
    createdAt: new Date().toISOString(),
    editedAt: null,
    attachments: [],
    moderation: 'VISIBLE',
    reported: false,
    reactions: emptyReactionTotals(),
    myReaction: null,
    threadCount: 0,
    pending: true,
    pendingImages: ctx.images ?? 0,
  }
}

// Settle a stand-in against what the server answered: the real row takes its place
// (keeping the position), is appended when a reload wiped the stand-in mid-flight,
// or is dropped when the `chat:new` echo already landed it. A null row just removes
// the stand-in.
export function settlePending(
  list: DecryptedMessage[],
  localId: string,
  row: DecryptedMessage | null,
): DecryptedMessage[] {
  const at = list.findIndex((m) => m.id === localId)
  const without = at === -1 ? [...list] : [...list.slice(0, at), ...list.slice(at + 1)]
  if (!row || without.some((m) => m.id === row.id)) return without
  if (at === -1) return [...without, row]
  without.splice(at, 0, row)
  return without
}

// The failed bubble carries its own payload, so retrying needs nothing but the row.
export function failedFrom(
  local: DecryptedMessage,
  text: string,
  opts: SendOptions,
): DecryptedMessage {
  return { ...local, pending: false, failed: true, retry: { text, opts } }
}
