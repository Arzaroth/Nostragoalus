import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatIdentity, chatMessage, dmThread, dmThreadKey, dmThreadRead, leagueMember, user } from '../../../db/schema'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'
import { keysetBefore } from '../keyset'

// Direct messages are end-to-end encrypted with the same crypto as league chat
// (app/utils/e2ee.ts): a DM thread has a symmetric key sealed to each of the two
// participants' chat_identity public keys. The server only ever moves ciphertext,
// public keys and sealed keys. A DM message is a chat_message row with dmThreadId
// set, so it reuses that table's reactions/attachments/reports/reply machinery.

const MAX_CIPHERTEXT = 16_384
const DEFAULT_PAGE = 50
const MAX_PAGE = 100
const MAX_SEARCH = 20

// A DM thread stores its participants as an ordered pair (userAId < userBId) so
// the pair is canonical - one thread per unordered {a, b}. Order any two ids the
// same way before looking a thread up or creating one.
export function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export interface DmThreadRow {
  id: string
  userAId: string
  userBId: string
  keyEpoch: number
}

// The thread for a pair, or null. Either order of (a, b) resolves to the same row.
export async function getThreadForPair(db: AppDatabase, a: string, b: string): Promise<DmThreadRow | null> {
  const [lo, hi] = orderPair(a, b)
  const rows = await db
    .select({ id: dmThread.id, userAId: dmThread.userAId, userBId: dmThread.userBId, keyEpoch: dmThread.keyEpoch })
    .from(dmThread)
    .where(and(eq(dmThread.userAId, lo), eq(dmThread.userBId, hi)))
    .limit(1)
  return rows[0] ?? null
}

// Load a thread the caller participates in, or throw NotFound (a non-participant
// must not learn the thread exists). Returns the row plus the other user's id.
export async function requireParticipant(
  db: AppDatabase,
  threadId: string,
  userId: string,
): Promise<DmThreadRow & { otherId: string }> {
  const rows = await db
    .select({ id: dmThread.id, userAId: dmThread.userAId, userBId: dmThread.userBId, keyEpoch: dmThread.keyEpoch })
    .from(dmThread)
    .where(eq(dmThread.id, threadId))
    .limit(1)
  const t = rows[0]
  if (!t || (t.userAId !== userId && t.userBId !== userId)) throw new NotFoundError('conversation not found')
  return { ...t, otherId: t.userAId === userId ? t.userBId : t.userAId }
}

export interface PublicIdentity {
  userId: string
  publicKey: string
  name: string
  image: string | null
}

// The chat public key + display name for a user, or null if they have no chat
// identity yet (they cannot be DMed until they set one up on their first chat use).
export async function getPublicIdentity(db: AppDatabase, userId: string): Promise<PublicIdentity | null> {
  const rows = await db
    .select({ userId: chatIdentity.userId, publicKey: chatIdentity.publicKey, name: user.name, image: user.image })
    .from(chatIdentity)
    .innerJoin(user, eq(user.id, chatIdentity.userId))
    .where(eq(chatIdentity.userId, userId))
    .limit(1)
  return rows[0] ?? null
}

export interface DmWrappedKeyInput {
  userId: string
  wrappedKey: string
}

// Open (or reopen) a DM thread with a recipient. Idempotent: if the thread already
// exists it is returned untouched (the supplied wraps are ignored - the key is
// already established). On first creation the caller's client has generated the
// thread key and sealed it to BOTH participants' public keys; the server persists
// exactly those two wraps at epoch 1. A recipient with no chat identity, or DMing
// yourself, is rejected.
export async function createThread(
  db: AppDatabase,
  opts: { userId: string; recipientId: string; wraps: DmWrappedKeyInput[] },
): Promise<{ threadId: string; epoch: number; created: boolean; otherId: string }> {
  if (opts.userId === opts.recipientId) throw new ValidationError('cannot message yourself')
  const recipient = await getPublicIdentity(db, opts.recipientId)
  if (!recipient) throw new ValidationError('this user has not set up chat yet')
  const existing = await getThreadForPair(db, opts.userId, opts.recipientId)
  if (existing) {
    return { threadId: existing.id, epoch: existing.keyEpoch, created: false, otherId: opts.recipientId }
  }
  const participants = new Set([opts.userId, opts.recipientId])
  if (opts.wraps.length !== 2 || !opts.wraps.every((w) => participants.has(w.userId))) {
    throw new ValidationError('a wrapped key is required for each participant')
  }
  const [lo, hi] = orderPair(opts.userId, opts.recipientId)
  const threadId = randomUUID()
  const epoch = 1
  try {
    await db.transaction(async (tx) => {
      await tx.insert(dmThread).values({ id: threadId, userAId: lo, userBId: hi, keyEpoch: epoch })
      await tx
        .insert(dmThreadKey)
        .values(opts.wraps.map((w) => ({ threadId, userId: w.userId, epoch, wrappedKey: w.wrappedKey })))
    })
  } catch {
    // A concurrent createThread for the same pair lost the unique-pair race; the
    // other one won and its keys stand. Return the now-existing thread.
    const raced = await getThreadForPair(db, opts.userId, opts.recipientId)
    if (!raced) throw new ConflictError('could not open conversation')
    return { threadId: raced.id, epoch: raced.keyEpoch, created: false, otherId: opts.recipientId }
  }
  return { threadId, epoch, created: true, otherId: opts.recipientId }
}

export interface DmThreadSummary {
  threadId: string
  other: { id: string; name: string; image: string | null }
  lastMessageAt: Date | null
  unread: number
  myWrappedKey: string | null
}

// The caller's DM inbox: every thread they participate in, newest activity first,
// each with the other participant, the unread count (messages after the caller's
// last-read marker, not their own, not removed) and the caller's sealed key for
// the current epoch (so the client can decrypt without a second round trip).
export async function listThreads(db: AppDatabase, userId: string): Promise<DmThreadSummary[]> {
  const threads = await db
    .select({
      id: dmThread.id,
      keyEpoch: dmThread.keyEpoch,
      createdAt: dmThread.createdAt,
      lastMessageAt: dmThread.lastMessageAt,
      otherId: sql<string>`case when ${dmThread.userAId} = ${userId} then ${dmThread.userBId} else ${dmThread.userAId} end`,
    })
    .from(dmThread)
    .where(or(eq(dmThread.userAId, userId), eq(dmThread.userBId, userId)))
    .orderBy(desc(dmThread.lastMessageAt), desc(dmThread.createdAt))
  if (threads.length === 0) return []
  const ids = threads.map((t) => t.id)
  const otherIds = threads.map((t) => t.otherId)
  const [reads, others, myKeys] = await Promise.all([
    db
      .select({ threadId: dmThreadRead.threadId, lastReadAt: dmThreadRead.lastReadAt })
      .from(dmThreadRead)
      .where(and(eq(dmThreadRead.userId, userId), inArray(dmThreadRead.threadId, ids))),
    db.select({ id: user.id, name: user.name, image: user.image }).from(user).where(inArray(user.id, otherIds)),
    db
      .select({ threadId: dmThreadKey.threadId, wrappedKey: dmThreadKey.wrappedKey, epoch: dmThreadKey.epoch })
      .from(dmThreadKey)
      .where(and(eq(dmThreadKey.userId, userId), inArray(dmThreadKey.threadId, ids))),
  ])
  const readAt = new Map(reads.map((r) => [r.threadId, r.lastReadAt]))
  const otherById = new Map(others.map((o) => [o.id, o]))
  const keyByThread = new Map<string, string>()
  for (const t of threads) {
    const k = myKeys.find((row) => row.threadId === t.id && row.epoch === t.keyEpoch)
    if (k) keyByThread.set(t.id, k.wrappedKey)
  }
  const unread = await Promise.all(
    threads.map(async (t) => {
      const since = readAt.get(t.id) ?? t.createdAt
      const rows = await db
        .select({ n: count() })
        .from(chatMessage)
        .where(
          and(
            eq(chatMessage.dmThreadId, t.id),
            ne(chatMessage.userId, userId),
            ne(chatMessage.moderationState, 'REMOVED'),
            sql`${chatMessage.createdAt} > ${since}`,
          ),
        )
      return Number(rows[0]?.n ?? 0)
    }),
  )
  return threads.map((t, i) => {
    const o = otherById.get(t.otherId)
    return {
      threadId: t.id,
      other: { id: t.otherId, name: o?.name ?? '', image: o?.image ?? null },
      lastMessageAt: t.lastMessageAt,
      unread: unread[i],
      myWrappedKey: keyByThread.get(t.id) ?? null,
    }
  })
}

export interface DmEpochKey {
  epoch: number
  wrappedKey: string
}

export interface DmThreadDetail {
  threadId: string
  epoch: number
  other: PublicIdentity
  myWrappedKeys: DmEpochKey[]
}

// Full detail for one thread the caller is in: the other participant's public
// identity (name, image, public key) and the caller's sealed key for EVERY epoch,
// so history sealed under a rotated-out key stays decryptable.
export async function getThreadDetail(db: AppDatabase, threadId: string, userId: string): Promise<DmThreadDetail> {
  const t = await requireParticipant(db, threadId, userId)
  const other = await getPublicIdentity(db, t.otherId)
  if (!other) throw new NotFoundError('conversation not found')
  const keys = await db
    .select({ epoch: dmThreadKey.epoch, wrappedKey: dmThreadKey.wrappedKey })
    .from(dmThreadKey)
    .where(and(eq(dmThreadKey.threadId, threadId), eq(dmThreadKey.userId, userId)))
    .orderBy(asc(dmThreadKey.epoch))
  return { threadId, epoch: t.keyEpoch, other, myWrappedKeys: keys }
}

export interface DmMessageRow {
  id: string
  userId: string | null
  parentId: string | null
  threadId: string | null
  epoch: number
  ciphertext: string
  moderationState: 'VISIBLE' | 'PENDING' | 'REMOVED'
  editedAt: Date | null
  createdAt: Date
}

const messageColumns = {
  id: chatMessage.id,
  userId: chatMessage.userId,
  parentId: chatMessage.parentId,
  threadId: chatMessage.threadId,
  epoch: chatMessage.epoch,
  ciphertext: chatMessage.ciphertext,
  moderationState: chatMessage.moderationState,
  editedAt: chatMessage.editedAt,
  createdAt: chatMessage.createdAt,
}

// Post a message into a DM thread. Participant-only; the epoch must match the
// thread's current key epoch (a stale client re-keyed out is told to refresh). A
// quote (parentId) must point at a message in the same thread. Stamps the thread's
// lastMessageAt so the inbox re-sorts. Returns the row plus the recipient id so the
// route can push it live and notify.
export async function postDmMessage(
  db: AppDatabase,
  opts: { threadId: string; userId: string; ciphertext: string; epoch: number; parentId?: string | null; threadRootId?: string | null },
): Promise<DmMessageRow & { otherId: string }> {
  if (!opts.ciphertext) throw new ValidationError('empty message')
  if (opts.ciphertext.length > MAX_CIPHERTEXT) throw new ValidationError('message too large')
  const t = await requireParticipant(db, opts.threadId, opts.userId)
  if (opts.epoch !== t.keyEpoch) throw new ConflictError('stale key epoch')
  for (const targetId of [opts.parentId, opts.threadRootId]) {
    if (!targetId) continue
    const p = await db
      .select({ dmThreadId: chatMessage.dmThreadId })
      .from(chatMessage)
      .where(eq(chatMessage.id, targetId))
      .limit(1)
    if (!p[0] || p[0].dmThreadId !== opts.threadId) throw new ValidationError('reply target is not in this conversation')
  }
  const messageId = randomUUID()
  const row = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(chatMessage)
      .values({
        id: messageId,
        dmThreadId: opts.threadId,
        parentId: opts.parentId ?? null,
        threadId: opts.threadRootId ?? null,
        userId: opts.userId,
        epoch: opts.epoch,
        ciphertext: opts.ciphertext,
      })
      .returning(messageColumns)
    await tx.update(dmThread).set({ lastMessageAt: inserted[0].createdAt }).where(eq(dmThread.id, opts.threadId))
    return inserted[0]
  })
  return { ...row, otherId: t.otherId }
}

// The author replaces their own DM message text (re-encrypted client-side, sealed
// under the current epoch). Author only, visible messages only. Stamps editedAt.
export async function editDmMessage(
  db: AppDatabase,
  opts: { threadId: string; messageId: string; userId: string; ciphertext: string },
): Promise<{ editedAt: Date }> {
  if (!opts.ciphertext) throw new ValidationError('empty message')
  if (opts.ciphertext.length > MAX_CIPHERTEXT) throw new ValidationError('message too large')
  const t = await requireParticipant(db, opts.threadId, opts.userId)
  const rows = await db
    .select({ dmThreadId: chatMessage.dmThreadId, userId: chatMessage.userId, state: chatMessage.moderationState })
    .from(chatMessage)
    .where(eq(chatMessage.id, opts.messageId))
    .limit(1)
  if (!rows[0] || rows[0].dmThreadId !== opts.threadId) throw new NotFoundError('message not found')
  if (rows[0].userId !== opts.userId) throw new ForbiddenError('only the author can edit this message')
  if (rows[0].state !== 'VISIBLE') throw new ValidationError('this message cannot be edited')
  const editedAt = new Date()
  await db.update(chatMessage).set({ ciphertext: opts.ciphertext, epoch: t.keyEpoch, editedAt }).where(eq(chatMessage.id, opts.messageId))
  return { editedAt }
}

// A page of ciphertext for one thread, newest first; `before`/`beforeId` page back
// through history (compound keyset, matching listMessages). Thread mode lists a
// root's replies oldest-first; default lists everything not a thread reply.
export async function listDmMessages(
  db: AppDatabase,
  opts: { threadId: string; userId: string; before?: Date; beforeId?: string; limit?: number; thread?: string | null },
): Promise<DmMessageRow[]> {
  await requireParticipant(db, opts.threadId, opts.userId)
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE, 1), MAX_PAGE)
  const scope = opts.thread ? eq(chatMessage.threadId, opts.thread) : isNull(chatMessage.threadId)
  const cursor = keysetBefore(chatMessage.createdAt, chatMessage.id, opts.before, opts.beforeId)
  const rows = await db
    .select(messageColumns)
    .from(chatMessage)
    .where(and(eq(chatMessage.dmThreadId, opts.threadId), scope, cursor))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
    .limit(limit)
  return opts.thread ? rows.reverse() : rows
}

// Mark a thread read up to now for the caller (participant-only). Upsert on the
// (userId, threadId) marker; drives the inbox unread counts.
export async function markThreadRead(db: AppDatabase, threadId: string, userId: string): Promise<void> {
  await requireParticipant(db, threadId, userId)
  const now = new Date()
  await db
    .insert(dmThreadRead)
    .values({ userId, threadId, lastReadAt: now })
    .onConflictDoUpdate({ target: [dmThreadRead.userId, dmThreadRead.threadId], set: { lastReadAt: now } })
}

export interface RecipientSuggestion {
  userId: string
  name: string
  image: string | null
  shared: boolean
}

// Search for someone to DM. A candidate must have a chat identity (else they can't
// be sealed a key). Two pools, unioned and de-duped: co-members (anyone sharing a
// league with the caller, always searchable) and globally discoverable users
// (dm_discoverable = true). Self is excluded. `shared` marks co-members so the UI
// can label them. Empty query returns co-member suggestions only.
export async function searchRecipients(db: AppDatabase, viewerId: string, query: string): Promise<RecipientSuggestion[]> {
  const term = query.trim()
  const coMemberIds = await db
    .selectDistinct({ userId: leagueMember.userId })
    .from(leagueMember)
    .where(
      and(
        ne(leagueMember.userId, viewerId),
        inArray(
          leagueMember.leagueId,
          db.select({ leagueId: leagueMember.leagueId }).from(leagueMember).where(eq(leagueMember.userId, viewerId)),
        ),
      ),
    )
  const sharedSet = new Set(coMemberIds.map((r) => r.userId))
  const nameMatch = term ? ilike(user.name, `%${term}%`) : undefined
  // Co-members matching the term (or all of them when the query is empty).
  const coMembers = sharedSet.size
    ? await db
        .select({ userId: user.id, name: user.name, image: user.image })
        .from(user)
        .innerJoin(chatIdentity, eq(chatIdentity.userId, user.id))
        .where(and(inArray(user.id, [...sharedSet]), nameMatch))
        .limit(MAX_SEARCH)
    : []
  // Globally discoverable strangers only make sense with a search term.
  const strangers = term
    ? await db
        .select({ userId: user.id, name: user.name, image: user.image })
        .from(user)
        .innerJoin(chatIdentity, eq(chatIdentity.userId, user.id))
        .where(and(eq(user.dmDiscoverable, true), ne(user.id, viewerId), ilike(user.name, `%${term}%`)))
        .limit(MAX_SEARCH)
    : []
  const out: RecipientSuggestion[] = coMembers.map((r) => ({ ...r, shared: true }))
  const seen = new Set(out.map((r) => r.userId))
  for (const s of strangers) {
    if (seen.has(s.userId)) continue
    seen.add(s.userId)
    out.push({ ...s, shared: false })
  }
  return out.slice(0, MAX_SEARCH)
}
