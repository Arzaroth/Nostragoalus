import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, inArray, isNull, lt, not } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { chatAttachment, chatIdentity, chatMessage, league, leagueChatKey, leagueMember, match, user } from '../../../db/schema'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'
import { getLeague, getMembership } from '../leagues/service'
import { appendKeyBindingTx } from '../key-transparency/service'
import { keysetBefore } from '../keyset'
import type { StorageDriver } from '../storage/driver'
import { deleteChatImage, putChatImage, resolveStorage } from '../storage'
import { chatImageKey } from '../storage/keys'

// All chat content is end-to-end encrypted client-side; this service only ever
// moves ciphertext, public keys and sealed (wrapped) group keys. It never holds
// a key it could unwrap. See app/utils/e2ee.ts for the crypto.

const MAX_CIPHERTEXT = 16_384 // generous cap on one encrypted message blob (base64)
// Encrypted image blob cap (base64). A 5MB original compresses to webp then
// encrypts; this leaves generous headroom while bounding one row's weight.
const MAX_ATTACHMENT = 9_000_000
// How many images one message may carry (send or after an edit). Keeps a single
// bubble bounded and the per-message attachment fan-out small.
const MAX_IMAGES = 6
const DEFAULT_PAGE = 50
const MAX_PAGE = 100

function assertLeagueAdmin(membership: { role: string } | null): void {
  if (!membership || (membership.role !== 'OWNER' && membership.role !== 'MODERATOR')) {
    throw new ForbiddenError('only the league owner or a moderator can do this')
  }
}

// --- identity ---

export interface ChatIdentityRow {
  publicKey: string
  recoveryWrappedKey: string | null
}

export async function getChatIdentity(db: AppDatabase, userId: string): Promise<ChatIdentityRow | null> {
  const rows = await db
    .select({ publicKey: chatIdentity.publicKey, recoveryWrappedKey: chatIdentity.recoveryWrappedKey })
    .from(chatIdentity)
    .where(eq(chatIdentity.userId, userId))
    .limit(1)
  return rows[0] ?? null
}

// Publish the caller's public key once. An existing key is never overwritten
// (that would orphan every group key sealed to it); the existing key is returned
// so the client can tell it generated a stray keypair and should restore instead.
export async function registerChatIdentity(
  db: AppDatabase,
  userId: string,
  publicKey: string,
): Promise<{ publicKey: string; created: boolean }> {
  if (!publicKey) throw new ValidationError('public key required')
  // Insert the identity and log its key in ONE transaction: the KT guarantee is that
  // every published key is in the transparency log, so a failure to append (a lost
  // genesis race, a transient error) must roll the identity insert back too - never
  // leave an identity that has no log entry (clients read that as a substituted key).
  return await db.transaction(async (tx) => {
    const existing = await getChatIdentity(tx, userId)
    if (existing) return { publicKey: existing.publicKey, created: false }
    const inserted = await tx
      .insert(chatIdentity)
      .values({ userId, publicKey })
      .onConflictDoNothing()
      .returning({ userId: chatIdentity.userId })
    // Only the insert that actually landed appends - a concurrent enrolment that
    // lost the conflict does not double-log.
    if (inserted.length > 0) await appendKeyBindingTx(tx, userId, publicKey)
    return { publicKey, created: inserted.length > 0 }
  })
}

// Store (or replace) the recovery-code escrow of the caller's private key.
export async function setRecoveryBlob(db: AppDatabase, userId: string, blob: string): Promise<void> {
  if (!blob) throw new ValidationError('recovery blob required')
  const res = await db
    .update(chatIdentity)
    .set({ recoveryWrappedKey: blob })
    .where(eq(chatIdentity.userId, userId))
    .returning({ userId: chatIdentity.userId })
  if (res.length === 0) throw new NotFoundError('chat identity not found')
}

// The caller's escrow blob, for restoring their private key on a new device.
export async function getRecoveryBlob(db: AppDatabase, userId: string): Promise<string | null> {
  const id = await getChatIdentity(db, userId)
  return id?.recoveryWrappedKey ?? null
}

export interface MemberKey {
  userId: string
  publicKey: string
  // Display name for chat. Chat is members-only and opt-in, so participants are
  // named here even when they are hidden from the public leaderboard/roster -
  // otherwise fellow members would just see "Someone" against their messages.
  name: string
}

// Public keys of every league member who has a chat identity (so a keyholder can
// seal the group key to them).
export async function getMemberPublicKeys(db: AppDatabase, leagueId: string): Promise<MemberKey[]> {
  return db
    .select({ userId: leagueMember.userId, publicKey: chatIdentity.publicKey, name: user.name })
    .from(leagueMember)
    .innerJoin(chatIdentity, eq(chatIdentity.userId, leagueMember.userId))
    .innerJoin(user, eq(user.id, leagueMember.userId))
    .where(eq(leagueMember.leagueId, leagueId))
}

export interface EpochKey {
  epoch: number
  wrappedKey: string
}

export interface ChatStatus {
  enabled: boolean
  epoch: number
  role: string
  myWrappedKeys: EpochKey[]
  missingKeys: MemberKey[]
  memberKeys: MemberKey[]
  // A member was removed since the last rotation; a keyholder client should
  // rotate the group key to give the remaining members forward secrecy.
  rekeyPending: boolean
}

// Chat status for a league member: whether chat is on, the current key epoch, the
// caller's sealed group key for every epoch (so old history stays decryptable
// across re-keys), members still missing the current key (so a keyholder can wrap
// for them) and every member's public key. Members only - a missing membership or
// league throws NotFound so the route can 404 (hiding the league from non-members).
export async function getChatStatus(db: AppDatabase, leagueId: string, userId: string): Promise<ChatStatus> {
  const [membership, lg] = await Promise.all([getMembership(db, leagueId, userId), getLeague(db, leagueId)])
  if (!membership || !lg) throw new NotFoundError('league not found')
  const epoch = lg.chatKeyEpoch
  const [myWrappedKeys, missingKeys, memberKeys] = await Promise.all([
    lg.chatEnabled ? getMyWrappedKeys(db, leagueId, userId) : Promise.resolve<EpochKey[]>([]),
    lg.chatEnabled ? getMembersMissingKey(db, leagueId, epoch) : Promise.resolve<MemberKey[]>([]),
    getMemberPublicKeys(db, leagueId),
  ])
  return {
    enabled: lg.chatEnabled,
    epoch,
    role: membership.role,
    myWrappedKeys,
    missingKeys,
    memberKeys,
    rekeyPending: lg.chatEnabled && lg.chatRekeyPendingAt != null,
  }
}

// --- enable / disable ---

export interface WrappedKeyInput {
  userId: string
  wrappedKey: string
}

export async function getLeagueMemberIds(db: AppDatabase, leagueId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: leagueMember.userId })
    .from(leagueMember)
    .where(eq(leagueMember.leagueId, leagueId))
  return rows.map((r) => r.userId)
}

// The ids of every league a user belongs to - used to fan a roster/name change out
// to all the leagues whose chats show that user.
export async function getUserLeagueIds(db: AppDatabase, userId: string): Promise<string[]> {
  const rows = await db
    .select({ leagueId: leagueMember.leagueId })
    .from(leagueMember)
    .where(eq(leagueMember.userId, userId))
  return rows.map((r) => r.leagueId)
}

async function leagueMemberIds(db: AppDatabase, leagueId: string): Promise<Set<string>> {
  return new Set(await getLeagueMemberIds(db, leagueId))
}

// Enable chat for a league (OWNER/MODERATOR only). The FIRST enable bumps the key
// epoch from 0 and stores the group key sealed to each provided member (the
// actor's client generated it and supplies the wraps; the server only persists
// them). Re-enabling a league that was turned off keeps the existing epoch and
// keys so prior history stays decryptable - it does not re-key, matching what
// disableLeagueChat promises, and any supplied wraps are ignored.
export async function enableLeagueChat(
  db: AppDatabase,
  opts: { leagueId: string; actorId: string; wraps: WrappedKeyInput[] },
): Promise<{ epoch: number }> {
  const rows = await db
    .select({ epoch: league.chatKeyEpoch, enabled: league.chatEnabled })
    .from(league)
    .where(eq(league.id, opts.leagueId))
    .limit(1)
  // Hide existence like resolveLeagueManage: a non-member (or a missing league)
  // gets a 404, never a 403 that would confirm a private league is real.
  const membership = await getMembership(db, opts.leagueId, opts.actorId)
  if (rows.length === 0 || !membership) throw new NotFoundError('league not found')
  assertLeagueAdmin(membership)
  if (rows[0].enabled) throw new ConflictError('chat already enabled')
  const firstEnable = rows[0].epoch === 0
  const epoch = firstEnable ? rows[0].epoch + 1 : rows[0].epoch

  if (firstEnable) {
    const members = await leagueMemberIds(db, opts.leagueId)
    for (const w of opts.wraps) {
      if (!members.has(w.userId)) throw new ValidationError('cannot wrap the key for a non-member')
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(league)
      .set({ chatEnabled: true, chatEnabledAt: new Date(), chatEnabledBy: opts.actorId, chatKeyEpoch: epoch })
      .where(eq(league.id, opts.leagueId))
    if (firstEnable && opts.wraps.length > 0) {
      await tx
        .insert(leagueChatKey)
        .values(opts.wraps.map((w) => ({ leagueId: opts.leagueId, userId: w.userId, epoch, wrappedKey: w.wrappedKey })))
    }
  })
  return { epoch }
}

// Turn chat off (OWNER/MODERATOR). History and keys are kept so it can be turned
// back on without a re-key.
export async function disableLeagueChat(
  db: AppDatabase,
  opts: { leagueId: string; actorId: string },
): Promise<void> {
  const rows = await db.select({ id: league.id }).from(league).where(eq(league.id, opts.leagueId)).limit(1)
  const membership = await getMembership(db, opts.leagueId, opts.actorId)
  if (rows.length === 0 || !membership) throw new NotFoundError('league not found')
  assertLeagueAdmin(membership)
  await db.update(league).set({ chatEnabled: false }).where(eq(league.id, opts.leagueId))
}

// Rotate the league group key (OWNER/MODERATOR only). Bumps the epoch and stores a
// fresh group key sealed to the current members (the actor's client generated it).
// Old ciphertext stays at the old epoch and is still readable by whoever holds the
// old key; members who lost access (removed, or a stuck wrap) get a clean key at
// the new epoch, and anyone no longer a member is left without the new key.
export async function rotateLeagueChatKey(
  db: AppDatabase,
  opts: { leagueId: string; actorId: string; wraps: WrappedKeyInput[] },
): Promise<{ epoch: number }> {
  const rows = await db
    .select({ epoch: league.chatKeyEpoch, enabled: league.chatEnabled })
    .from(league)
    .where(eq(league.id, opts.leagueId))
    .limit(1)
  const membership = await getMembership(db, opts.leagueId, opts.actorId)
  if (rows.length === 0 || !membership) throw new NotFoundError('league not found')
  assertLeagueAdmin(membership)
  if (!rows[0].enabled) throw new ForbiddenError('chat is not enabled for this league')
  const epoch = rows[0].epoch + 1

  const members = await leagueMemberIds(db, opts.leagueId)
  for (const w of opts.wraps) {
    if (!members.has(w.userId)) throw new ValidationError('cannot wrap the key for a non-member')
  }

  await db.transaction(async (tx) => {
    await tx.update(league).set({ chatKeyEpoch: epoch, chatRekeyPendingAt: null }).where(eq(league.id, opts.leagueId))
    if (opts.wraps.length > 0) {
      await tx
        .insert(leagueChatKey)
        .values(opts.wraps.map((w) => ({ leagueId: opts.leagueId, userId: w.userId, epoch, wrappedKey: w.wrappedKey })))
    }
  })
  return { epoch }
}

// --- key distribution ---

// The caller's sealed group key for an epoch (null if none yet - a keyholder
// still needs to wrap it for them).
export async function getMyWrappedKey(
  db: AppDatabase,
  leagueId: string,
  userId: string,
  epoch: number,
): Promise<string | null> {
  const rows = await db
    .select({ wrappedKey: leagueChatKey.wrappedKey })
    .from(leagueChatKey)
    .where(and(eq(leagueChatKey.leagueId, leagueId), eq(leagueChatKey.userId, userId), eq(leagueChatKey.epoch, epoch)))
    .limit(1)
  return rows[0]?.wrappedKey ?? null
}

// Every epoch's sealed group key for the caller, oldest first. The client opens
// each into an epoch->key map and decrypts each message with its own epoch's key,
// so a re-key (rotateLeagueChatKey) never makes prior history undecryptable.
export async function getMyWrappedKeys(db: AppDatabase, leagueId: string, userId: string): Promise<EpochKey[]> {
  return db
    .select({ epoch: leagueChatKey.epoch, wrappedKey: leagueChatKey.wrappedKey })
    .from(leagueChatKey)
    .where(and(eq(leagueChatKey.leagueId, leagueId), eq(leagueChatKey.userId, userId)))
    .orderBy(leagueChatKey.epoch)
}

// Members who have a chat identity but no sealed key yet at this epoch - a
// keyholder client wraps the group key for each and uploads via addWrappedKeys.
export async function getMembersMissingKey(
  db: AppDatabase,
  leagueId: string,
  epoch: number,
): Promise<MemberKey[]> {
  return db
    .select({ userId: leagueMember.userId, publicKey: chatIdentity.publicKey, name: user.name })
    .from(leagueMember)
    .innerJoin(chatIdentity, eq(chatIdentity.userId, leagueMember.userId))
    .innerJoin(user, eq(user.id, leagueMember.userId))
    .leftJoin(
      leagueChatKey,
      and(
        eq(leagueChatKey.leagueId, leagueMember.leagueId),
        eq(leagueChatKey.userId, leagueMember.userId),
        eq(leagueChatKey.epoch, epoch),
      ),
    )
    .where(and(eq(leagueMember.leagueId, leagueId), isNull(leagueChatKey.id)))
}

// Any member holding the key can seal it for newcomers at the current epoch.
export async function addWrappedKeys(
  db: AppDatabase,
  opts: { leagueId: string; actorId: string; epoch: number; wraps: WrappedKeyInput[] },
): Promise<{ added: number }> {
  const rows = await db
    .select({ epoch: league.chatKeyEpoch })
    .from(league)
    .where(eq(league.id, opts.leagueId))
    .limit(1)
  const membership = await getMembership(db, opts.leagueId, opts.actorId)
  if (rows.length === 0 || !membership) throw new NotFoundError('league not found')
  if (opts.epoch !== rows[0].epoch) throw new ConflictError('stale key epoch')
  if (opts.wraps.length === 0) return { added: 0 }
  const members = await leagueMemberIds(db, opts.leagueId)
  for (const w of opts.wraps) {
    if (!members.has(w.userId)) throw new ValidationError('cannot wrap the key for a non-member')
  }
  const res = await db
    .insert(leagueChatKey)
    .values(opts.wraps.map((w) => ({ leagueId: opts.leagueId, userId: w.userId, epoch: opts.epoch, wrappedKey: w.wrappedKey })))
    .onConflictDoNothing()
    .returning({ id: leagueChatKey.id })
  return { added: res.length }
}

// A member with no sealed key at the current epoch (just joined, or a stuck wrap)
// wants a keyholder to re-seal it. Returns whether a request is warranted: a
// member, chat on, and actually missing the current key - so the route only
// broadcasts a rekey prompt when it would help. Non-members (or an absent league)
// 404 to keep the league hidden, matching getChatStatus.
export async function requestChatRekey(
  db: AppDatabase,
  leagueId: string,
  userId: string,
): Promise<{ requested: boolean; epoch: number }> {
  const [membership, lg] = await Promise.all([getMembership(db, leagueId, userId), getLeague(db, leagueId)])
  if (!membership || !lg) throw new NotFoundError('league not found')
  if (!lg.chatEnabled) return { requested: false, epoch: lg.chatKeyEpoch }
  const existing = await getMyWrappedKey(db, leagueId, userId, lg.chatKeyEpoch)
  return { requested: existing === null, epoch: lg.chatKeyEpoch }
}

// --- messages ---

import type { ChatAttachmentDTO, ChatModerationState } from '../../../shared/types/chat'

export interface ChatMessageRow {
  id: string
  userId: string | null
  matchId: string | null
  parentId: string | null
  threadId: string | null
  epoch: number
  ciphertext: string
  moderationState: ChatModerationState
  editedAt: Date | null
  createdAt: Date
}

export interface AttachmentInput {
  ciphertext: string
  byteSize: number
}

export async function postMessage(
  db: AppDatabase,
  opts: {
    leagueId: string
    matchId?: string | null
    parentId?: string | null
    threadId?: string | null
    userId: string
    ciphertext: string
    epoch: number
    images?: AttachmentInput[] | null
  },
  driver?: StorageDriver,
): Promise<ChatMessageRow & { attachments: ChatAttachmentDTO[] }> {
  if (!opts.ciphertext) throw new ValidationError('empty message')
  if (opts.ciphertext.length > MAX_CIPHERTEXT) throw new ValidationError('message too large')
  const images = opts.images ?? []
  if (images.length > MAX_IMAGES) throw new ValidationError('too many images')
  for (const img of images) {
    if (img.ciphertext.length > MAX_ATTACHMENT) throw new ValidationError('image too large')
  }
  const rows = await db
    .select({ enabled: league.chatEnabled, epoch: league.chatKeyEpoch, competitionId: league.competitionId })
    .from(league)
    .where(eq(league.id, opts.leagueId))
    .limit(1)
  const membership = await getMembership(db, opts.leagueId, opts.userId)
  if (rows.length === 0 || !membership) throw new NotFoundError('league not found')
  if (!rows[0].enabled) throw new ForbiddenError('chat is not enabled for this league')
  if (opts.epoch !== rows[0].epoch) throw new ConflictError('stale key epoch')
  if (opts.matchId) {
    const m = await db
      .select({ competitionId: match.competitionId })
      .from(match)
      .where(eq(match.id, opts.matchId))
      .limit(1)
    if (m.length === 0 || m[0].competitionId !== rows[0].competitionId) {
      throw new ValidationError('match is not in this league competition')
    }
  }
  // A quote (parentId) or a thread reply (threadId) must point at a message in
  // the same room (league + match thread), so neither can leak across rooms.
  for (const targetId of [opts.parentId, opts.threadId]) {
    if (!targetId) continue
    const p = await db
      .select({ leagueId: chatMessage.leagueId, matchId: chatMessage.matchId })
      .from(chatMessage)
      .where(eq(chatMessage.id, targetId))
      .limit(1)
    if (p.length === 0 || p[0].leagueId !== opts.leagueId || (p[0].matchId ?? null) !== (opts.matchId ?? null)) {
      throw new ValidationError('reply target is not in this room')
    }
  }
  // Pre-generate the id so each image's ciphertext can be written to the storage
  // backend BEFORE the row insert (storage I/O must not run inside the db
  // transaction). The bytes are the opaque base64 ciphertext stored verbatim; keys
  // are chat/{messageId}/{idx}. Storage-before-row means a reader never finds a row
  // pointing at a missing object.
  const messageId = randomUUID()
  const attachmentRows: {
    messageId: string
    idx: number
    epoch: number
    storageKey: string
    ciphertext: null
    byteSize: number
  }[] = []
  if (images.length > 0) {
    const store = resolveStorage(driver)
    for (let idx = 0; idx < images.length; idx += 1) {
      const storageKey = await putChatImage(store, messageId, idx, images[idx].ciphertext)
      attachmentRows.push({ messageId, idx, epoch: opts.epoch, storageKey, ciphertext: null, byteSize: images[idx].byteSize })
    }
  }
  const row = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(chatMessage)
      .values({
        id: messageId,
        leagueId: opts.leagueId,
        matchId: opts.matchId ?? null,
        parentId: opts.parentId ?? null,
        threadId: opts.threadId ?? null,
        userId: opts.userId,
        epoch: opts.epoch,
        ciphertext: opts.ciphertext,
      })
      .returning({
        id: chatMessage.id,
        userId: chatMessage.userId,
        matchId: chatMessage.matchId,
        parentId: chatMessage.parentId,
        threadId: chatMessage.threadId,
        epoch: chatMessage.epoch,
        ciphertext: chatMessage.ciphertext,
        moderationState: chatMessage.moderationState,
        editedAt: chatMessage.editedAt,
        createdAt: chatMessage.createdAt,
      })
    if (attachmentRows.length > 0) {
      await tx.insert(chatAttachment).values(attachmentRows)
    }
    return inserted[0]
  })
  const attachments: ChatAttachmentDTO[] = images.map((_, idx) => ({ idx, epoch: opts.epoch }))
  return { ...row, attachments }
}

// The author replaces their own message text (re-encrypted client-side), and may
// drop some of its images (removeIdxs) and/or append new ones (addImages, sealed
// under the current epoch). The edit is stamped. Author only, and only while the
// message is visible (a removed or pending message cannot be edited). Returns the
// new edit time and the message's resulting attachments (idx order).
export async function editMessage(
  db: AppDatabase,
  opts: {
    leagueId: string
    messageId: string
    userId: string
    ciphertext: string
    addImages?: AttachmentInput[]
    removeIdxs?: number[]
  },
  driver?: StorageDriver,
): Promise<{ editedAt: Date; attachments: ChatAttachmentDTO[] }> {
  if (!opts.ciphertext) throw new ValidationError('empty message')
  if (opts.ciphertext.length > MAX_CIPHERTEXT) throw new ValidationError('message too large')
  const addImages = opts.addImages ?? []
  for (const img of addImages) {
    if (img.ciphertext.length > MAX_ATTACHMENT) throw new ValidationError('image too large')
  }
  const removeIdxs = new Set(opts.removeIdxs ?? [])
  const rows = await db
    .select({
      leagueId: chatMessage.leagueId,
      userId: chatMessage.userId,
      state: chatMessage.moderationState,
      epoch: league.chatKeyEpoch,
    })
    .from(chatMessage)
    .innerJoin(league, eq(league.id, chatMessage.leagueId))
    .where(eq(chatMessage.id, opts.messageId))
    .limit(1)
  if (!rows[0] || rows[0].leagueId !== opts.leagueId) throw new NotFoundError('message not found')
  if (rows[0].userId !== opts.userId) throw new ForbiddenError('only the author can edit this message')
  if (rows[0].state !== 'VISIBLE') throw new ValidationError('this message cannot be edited')
  const currentEpoch = rows[0].epoch
  const editedAt = new Date()

  // Read the current attachments outside the tx so new images can be written to the
  // storage backend before the row insert (storage I/O must not run inside a db
  // transaction). editMessage is author-only, so a concurrent change to this
  // message's attachments is pathological; the (messageId, idx) PK still guards an
  // idx collision (the insert would error and the edit retries).
  const existing = await db
    .select({ idx: chatAttachment.idx, epoch: chatAttachment.epoch })
    .from(chatAttachment)
    .where(eq(chatAttachment.messageId, opts.messageId))
    .orderBy(asc(chatAttachment.idx))
  const survivors = existing.filter((a) => !removeIdxs.has(a.idx))
  if (survivors.length + addImages.length > MAX_IMAGES) throw new ValidationError('too many images')

  // New images append after the highest idx that ever existed on this message
  // (not just the survivors) - a removed idx must never be reused, or a new image
  // written to that key would be wiped by the post-tx cleanup that deletes the
  // removed idxs' objects. Gaps are fine: idx is an identity, not a position.
  let nextIdx = existing.reduce((max, a) => Math.max(max, a.idx), -1) + 1
  const added: { idx: number; epoch: number; storageKey: string; byteSize: number }[] = []
  if (addImages.length > 0) {
    const store = resolveStorage(driver)
    for (const img of addImages) {
      const idx = nextIdx++
      const storageKey = await putChatImage(store, opts.messageId, idx, img.ciphertext)
      added.push({ idx, epoch: currentEpoch, storageKey, byteSize: img.byteSize })
    }
  }

  const attachments = await db.transaction(async (tx) => {
    // The new text is sealed under the current group key, so move the stored epoch
    // to match - otherwise a later reload would decrypt with the old key and fail.
    // Kept images stay at their own epoch (the client decrypts each accordingly).
    await tx
      .update(chatMessage)
      .set({ ciphertext: opts.ciphertext, epoch: currentEpoch, editedAt })
      .where(eq(chatMessage.id, opts.messageId))

    if (removeIdxs.size > 0) {
      await tx
        .delete(chatAttachment)
        .where(and(eq(chatAttachment.messageId, opts.messageId), inArray(chatAttachment.idx, [...removeIdxs])))
    }

    if (added.length > 0) {
      await tx.insert(chatAttachment).values(
        added.map((a) => ({ messageId: opts.messageId, idx: a.idx, epoch: a.epoch, storageKey: a.storageKey, ciphertext: null, byteSize: a.byteSize })),
      )
    }
    return [
      ...survivors.map((s) => ({ idx: s.idx, epoch: s.epoch })),
      ...added.map((a) => ({ idx: a.idx, epoch: a.epoch })),
    ].sort((a, b) => a.idx - b.idx)
  })

  // The removed images' objects are now unreferenced - drop them best-effort (a
  // legacy in-DB attachment simply has no object, so the delete is a harmless no-op).
  if (removeIdxs.size > 0) {
    const store = resolveStorage(driver)
    for (const idx of removeIdxs) {
      await deleteChatImage(store, chatImageKey(opts.messageId, idx)).catch(() => {})
    }
  }
  return { editedAt, attachments }
}

// A page of ciphertext for one room (matchId null = the league-global room),
// newest first. `before` pages backwards through history. By default this returns
// the room's main list (top-level + quoted messages, but NOT thread replies);
// pass `thread` (a root message id) to list that thread's replies, oldest-first.
export async function listMessages(
  db: AppDatabase,
  opts: {
    leagueId: string
    matchId?: string | null
    userId: string
    before?: Date
    beforeId?: string
    limit?: number
    thread?: string | null
  },
): Promise<ChatMessageRow[]> {
  // Members-only read: a non-member gets a 404 (hide existence), matching
  // resolveLeagueView and the chat mutations rather than a 403.
  const membership = await getMembership(db, opts.leagueId, opts.userId)
  if (!membership) throw new NotFoundError('league not found')
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE, 1), MAX_PAGE)
  const room = opts.matchId ? eq(chatMessage.matchId, opts.matchId) : isNull(chatMessage.matchId)
  // Thread mode: this root's replies, oldest-first. Room mode: everything that is
  // not a thread reply (quotes stay in the main list).
  const scope = opts.thread ? eq(chatMessage.threadId, opts.thread) : isNull(chatMessage.threadId)
  // Compound keyset cursor matching the (createdAt desc, id desc) sort: with the
  // id tiebreaker, a same-millisecond pair split across a page boundary is never
  // skipped or repeated. Falls back to createdAt-only if the caller has no id yet.
  const cursor = keysetBefore(chatMessage.createdAt, chatMessage.id, opts.before, opts.beforeId)
  const rows = await db
    .select({
      id: chatMessage.id,
      userId: chatMessage.userId,
      matchId: chatMessage.matchId,
      parentId: chatMessage.parentId,
      threadId: chatMessage.threadId,
      epoch: chatMessage.epoch,
      ciphertext: chatMessage.ciphertext,
      moderationState: chatMessage.moderationState,
      editedAt: chatMessage.editedAt,
      createdAt: chatMessage.createdAt,
    })
    .from(chatMessage)
    .where(and(eq(chatMessage.leagueId, opts.leagueId), room, scope, cursor))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
    .limit(limit)
  return opts.thread ? rows.reverse() : rows
}

// Thread reply counts (replies that are not removed) for a set of root message
// ids, so the main list can show a "N replies in thread" affordance. Missing ids
// have no thread.
export async function getThreadCounts(db: AppDatabase, rootIds: string[]): Promise<Record<string, number>> {
  if (rootIds.length === 0) return {}
  const rows = await db
    .select({ threadId: chatMessage.threadId, n: count() })
    .from(chatMessage)
    .where(
      and(
        inArray(chatMessage.threadId, rootIds),
        not(eq(chatMessage.moderationState, 'REMOVED')),
      ),
    )
    .groupBy(chatMessage.threadId)
  const out: Record<string, number> = {}
  // Every row is grouped by a non-null threadId (the inArray filter excludes
  // nulls), so the id is always present.
  for (const r of rows) out[r.threadId!] = Number(r.n)
  return out
}
