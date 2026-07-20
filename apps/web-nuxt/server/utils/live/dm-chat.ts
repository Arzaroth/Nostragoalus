import type { AppDatabase } from '../../../db/types'
import { requireParticipant } from '../dm/service'
import { NotFoundError } from '../errors'
import { publishDmTyping } from './hub'
import { createTtlCache } from '../cache/ttl-cache'

// The DM counterpart of league-chat's typing roster cache: the participant pair
// is fixed for the life of the thread, and typing pings fire once every couple of
// seconds per typist, so the pair is cached briefly to keep the hot path off the
// database.
const participantsCache = createTtlCache<string, readonly [string, string]>({ ttlMs: 10_000 })

// A participant is typing in a DM thread: broadcast it to the other participant's
// connected sockets. Returns false (no fan-out) when the sender is not in the
// thread, so a stranger can neither inject a typing hint into someone else's
// conversation nor learn that the thread exists. nowMs is passed in (the caller
// stamps it) to keep this testable, like publishTyping.
export async function publishDmTypingHint(
  db: AppDatabase,
  opts: { threadId: string; userId: string; nowMs: number },
): Promise<boolean> {
  let pair = participantsCache.get(opts.threadId, opts.nowMs)
  if (!pair) {
    try {
      const t = await requireParticipant(db, opts.threadId, opts.userId)
      pair = [t.userAId, t.userBId] as const
    } catch (e) {
      if (e instanceof NotFoundError) return false
      throw e
    }
    participantsCache.set(opts.threadId, pair, opts.nowMs)
  }
  if (!pair.includes(opts.userId)) return false
  publishDmTyping(
    pair.filter((id) => id !== opts.userId),
    opts.threadId,
    opts.userId,
  )
  return true
}
