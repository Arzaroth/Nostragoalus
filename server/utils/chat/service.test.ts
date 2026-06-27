import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import { memoryStorage } from '../../../tests/storage'
import { chatIdentity, chatMessage, league } from '../../../db/schema'
import {
  addWrappedKeys,
  disableLeagueChat,
  editMessage,
  enableLeagueChat,
  getChatIdentity,
  getChatStatus,
  getMemberPublicKeys,
  getMembersMissingKey,
  getMyWrappedKey,
  getMyWrappedKeys,
  getRecoveryBlob,
  getThreadCounts,
  getUserLeagueIds,
  listMessages,
  postMessage,
  registerChatIdentity,
  requestChatRekey,
  rotateLeagueChatKey,
  setRecoveryBlob,
} from './service'
import { getAttachmentCiphertext, getMessageAttachments } from './attachments'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'

type Db = Awaited<ReturnType<typeof createTestDb>>['db']

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const owner = await makeUser(ctx.db, 'owner')
  const leagueId = await makeLeague(ctx.db, { competitionId, ownerId: owner })
  return { ...ctx, competitionId, roundId, owner, leagueId, storage: memoryStorage() }
}

async function addIdentity(db: Db, userId: string, pk = `pk-${userId}`) {
  await db.insert(chatIdentity).values({ userId, publicKey: pk })
}
function wrapsFor(userIds: string[]) {
  return userIds.map((u) => ({ userId: u, wrappedKey: `wk-${u}` }))
}
async function enableWith(db: Db, leagueId: string, actorId: string, memberIds: string[]) {
  return enableLeagueChat(db, { leagueId, actorId, wraps: wrapsFor(memberIds) })
}

describe('chat identity', () => {
  it('rejects an empty public key', async () => {
    const { db, client, owner } = await setup()
    await expect(registerChatIdentity(db, owner, '')).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('registers once and does not overwrite an existing key', async () => {
    const { db, client, owner } = await setup()
    expect(await getChatIdentity(db, owner)).toBeNull()
    expect(await registerChatIdentity(db, owner, 'pkA')).toEqual({ publicKey: 'pkA', created: true })
    expect(await registerChatIdentity(db, owner, 'pkB')).toEqual({ publicKey: 'pkA', created: false })
    expect((await getChatIdentity(db, owner))?.publicKey).toBe('pkA')
    await client.close()
  })

  it('stores and reads back the recovery blob', async () => {
    const { db, client, owner } = await setup()
    await expect(setRecoveryBlob(db, owner, '')).rejects.toBeInstanceOf(ValidationError)
    await expect(setRecoveryBlob(db, owner, 'blob')).rejects.toBeInstanceOf(NotFoundError)
    await addIdentity(db, owner)
    expect(await getRecoveryBlob(db, owner)).toBeNull() // identity, no blob yet
    await setRecoveryBlob(db, owner, 'blob')
    expect(await getRecoveryBlob(db, owner)).toBe('blob')
    await client.close()
  })

  it('returns null recovery blob when there is no identity at all', async () => {
    const { db, client } = await setup()
    const stranger = await makeUser(db, 'stranger')
    expect(await getRecoveryBlob(db, stranger)).toBeNull()
    await client.close()
  })

  it('lists public keys only for members who have an identity', async () => {
    const { db, client, owner, leagueId } = await setup()
    const u2 = await makeUser(db, 'u2')
    await addLeagueMember(db, leagueId, u2)
    await addIdentity(db, owner)
    expect(await getMemberPublicKeys(db, leagueId)).toEqual([{ userId: owner, publicKey: 'pk-owner', name: owner }])
    await addIdentity(db, u2)
    expect((await getMemberPublicKeys(db, leagueId)).map((m) => m.userId).sort()).toEqual([owner, u2].sort())
    await client.close()
  })
})

describe('enableLeagueChat', () => {
  it('throws NotFound for an unknown league', async () => {
    const { db, client, owner } = await setup()
    await expect(enableLeagueChat(db, { leagueId: 'nope', actorId: owner, wraps: [] })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('forbids a non-member and a plain member', async () => {
    const { db, client, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(enableWith(db, leagueId, stranger, [])).rejects.toBeInstanceOf(ForbiddenError)
    const member = await makeUser(db, 'member')
    await addLeagueMember(db, leagueId, member)
    await expect(enableWith(db, leagueId, member, [])).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('enables for the owner and stores the wraps', async () => {
    const { db, client, owner, leagueId } = await setup()
    const r = await enableWith(db, leagueId, owner, [owner])
    expect(r.epoch).toBe(1)
    const lg = (await db.select().from(league).where(eq(league.id, leagueId)))[0]
    expect(lg.chatEnabled).toBe(true)
    expect(lg.chatKeyEpoch).toBe(1)
    expect(lg.chatEnabledBy).toBe(owner)
    expect(await getMyWrappedKey(db, leagueId, owner, 1)).toBe('wk-owner')
    await client.close()
  })

  it('enables for a moderator (with no wraps)', async () => {
    const { db, client, leagueId } = await setup()
    const mod = await makeUser(db, 'mod')
    await addLeagueMember(db, leagueId, mod, 'MODERATOR')
    const r = await enableWith(db, leagueId, mod, [])
    expect(r.epoch).toBe(1)
    await client.close()
  })

  it('conflicts when already enabled', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    await expect(enableWith(db, leagueId, owner, [owner])).rejects.toBeInstanceOf(ConflictError)
    await client.close()
  })

  it('rejects wrapping the key for a non-member', async () => {
    const { db, client, owner, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(enableWith(db, leagueId, owner, [stranger])).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('re-enabling keeps the same epoch and keys (no re-key)', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner]) // epoch 1, key wk-owner
    await disableLeagueChat(db, { leagueId, actorId: owner })
    // Re-enable with empty wraps: the existing key is reused, not regenerated.
    const r = await enableLeagueChat(db, { leagueId, actorId: owner, wraps: [] })
    expect(r.epoch).toBe(1)
    const lg = (await db.select().from(league).where(eq(league.id, leagueId)))[0]
    expect(lg.chatEnabled).toBe(true)
    expect(lg.chatKeyEpoch).toBe(1)
    expect(await getMyWrappedKey(db, leagueId, owner, 1)).toBe('wk-owner')
    await client.close()
  })
})

describe('getChatStatus', () => {
  it('throws NotFound for a non-member or unknown league', async () => {
    const { db, client, owner, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(getChatStatus(db, leagueId, stranger)).rejects.toBeInstanceOf(NotFoundError)
    await expect(getChatStatus(db, 'nope', owner)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('reports disabled chat with member keys but no epoch material', async () => {
    const { db, client, owner, leagueId } = await setup()
    await addIdentity(db, owner)
    const s = await getChatStatus(db, leagueId, owner)
    expect(s).toMatchObject({ enabled: false, epoch: 0, role: 'OWNER', myWrappedKeys: [], missingKeys: [] })
    expect(s.memberKeys).toEqual([{ userId: owner, publicKey: 'pk-owner', name: owner }])
    await client.close()
  })

  it('reports enabled chat with the caller keys (all epochs) and members still missing one', async () => {
    const { db, client, owner, leagueId } = await setup()
    await addIdentity(db, owner)
    await enableWith(db, leagueId, owner, [owner])
    const u2 = await makeUser(db, 'u2')
    await addLeagueMember(db, leagueId, u2)
    await addIdentity(db, u2) // identity, no key yet
    const s = await getChatStatus(db, leagueId, owner)
    expect(s.enabled).toBe(true)
    expect(s.epoch).toBe(1)
    expect(s.myWrappedKeys).toEqual([{ epoch: 1, wrappedKey: 'wk-owner' }])
    expect(s.missingKeys).toEqual([{ userId: u2, publicKey: 'pk-u2', name: u2 }])
    await client.close()
  })
})

describe('rotateLeagueChatKey', () => {
  it('throws NotFound, forbids non-admins, and refuses a disabled chat', async () => {
    const { db, client, owner, leagueId } = await setup()
    await expect(rotateLeagueChatKey(db, { leagueId: 'nope', actorId: owner, wraps: [] })).rejects.toBeInstanceOf(NotFoundError)
    // Enabled-but-non-admin and disabled-chat paths.
    await expect(rotateLeagueChatKey(db, { leagueId, actorId: owner, wraps: [] })).rejects.toBeInstanceOf(ForbiddenError) // chat off
    const member = await makeUser(db, 'member')
    await addLeagueMember(db, leagueId, member)
    await enableWith(db, leagueId, owner, [owner])
    await expect(rotateLeagueChatKey(db, { leagueId, actorId: member, wraps: [] })).rejects.toBeInstanceOf(ForbiddenError) // not admin
    await client.close()
  })

  it('rejects wrapping the new key for a non-member', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const stranger = await makeUser(db, 'stranger')
    await expect(rotateLeagueChatKey(db, { leagueId, actorId: owner, wraps: wrapsFor([stranger]) })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('bumps the epoch, keeps old-epoch keys, and stores the fresh ones', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner]) // epoch 1, wk-owner
    const r = await rotateLeagueChatKey(db, { leagueId, actorId: owner, wraps: [{ userId: owner, wrappedKey: 'wk2-owner' }] })
    expect(r.epoch).toBe(2)
    expect((await db.select().from(league).where(eq(league.id, leagueId)))[0].chatKeyEpoch).toBe(2)
    // Both epochs are retained for the caller (old history stays decryptable).
    expect(await getMyWrappedKeys(db, leagueId, owner)).toEqual([
      { epoch: 1, wrappedKey: 'wk-owner' },
      { epoch: 2, wrappedKey: 'wk2-owner' },
    ])
    await client.close()
  })

  it('rotates with no wraps (bumps the epoch, stores nothing new)', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner]) // epoch 1, wk-owner
    const r = await rotateLeagueChatKey(db, { leagueId, actorId: owner, wraps: [] })
    expect(r.epoch).toBe(2)
    expect((await db.select().from(league).where(eq(league.id, leagueId)))[0].chatKeyEpoch).toBe(2)
    expect(await getMyWrappedKeys(db, leagueId, owner)).toEqual([{ epoch: 1, wrappedKey: 'wk-owner' }])
    await client.close()
  })

  it('revokes a member left out of the rotation (no new-epoch key)', async () => {
    const { db, client, owner, leagueId } = await setup()
    const u2 = await makeUser(db, 'u2')
    await addLeagueMember(db, leagueId, u2)
    await enableWith(db, leagueId, owner, [owner, u2]) // both keyed at epoch 1
    await rotateLeagueChatKey(db, { leagueId, actorId: owner, wraps: [{ userId: owner, wrappedKey: 'wk2-owner' }] }) // u2 left out
    expect(await getMyWrappedKey(db, leagueId, u2, 2)).toBeNull()
    expect(await getMyWrappedKeys(db, leagueId, u2)).toEqual([{ epoch: 1, wrappedKey: 'wk-u2' }])
    await client.close()
  })
})

describe('disableLeagueChat', () => {
  it('throws NotFound for an unknown league', async () => {
    const { db, client, owner } = await setup()
    await expect(disableLeagueChat(db, { leagueId: 'nope', actorId: owner })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('forbids a non-admin', async () => {
    const { db, client, leagueId } = await setup()
    const member = await makeUser(db, 'member')
    await addLeagueMember(db, leagueId, member)
    await expect(disableLeagueChat(db, { leagueId, actorId: member })).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('turns chat off', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    await disableLeagueChat(db, { leagueId, actorId: owner })
    const lg = (await db.select().from(league).where(eq(league.id, leagueId)))[0]
    expect(lg.chatEnabled).toBe(false)
    await client.close()
  })
})

describe('key distribution', () => {
  it('getMyWrappedKey is null before a key exists', async () => {
    const { db, client, owner, leagueId } = await setup()
    expect(await getMyWrappedKey(db, leagueId, owner, 1)).toBeNull()
    await client.close()
  })

  it('lists members missing a key (identity but no wrap)', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner]) // owner has a key
    const u2 = await makeUser(db, 'u2')
    await addLeagueMember(db, leagueId, u2)
    await addIdentity(db, u2) // identity, no key
    const u3 = await makeUser(db, 'u3')
    await addLeagueMember(db, leagueId, u3) // no identity -> excluded
    expect(await getMembersMissingKey(db, leagueId, 1)).toEqual([{ userId: u2, publicKey: 'pk-u2', name: u2 }])
    await client.close()
  })

  it('addWrappedKeys: NotFound, Forbidden, stale epoch, empty, non-member, idempotent', async () => {
    const { db, client, owner, leagueId } = await setup()
    await expect(addWrappedKeys(db, { leagueId: 'nope', actorId: owner, epoch: 1, wraps: wrapsFor([owner]) })).rejects.toBeInstanceOf(NotFoundError)
    await enableWith(db, leagueId, owner, [owner])
    const stranger = await makeUser(db, 'stranger')
    await expect(addWrappedKeys(db, { leagueId, actorId: stranger, epoch: 1, wraps: wrapsFor([owner]) })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(addWrappedKeys(db, { leagueId, actorId: owner, epoch: 2, wraps: wrapsFor([owner]) })).rejects.toBeInstanceOf(ConflictError)
    expect(await addWrappedKeys(db, { leagueId, actorId: owner, epoch: 1, wraps: [] })).toEqual({ added: 0 })
    await expect(addWrappedKeys(db, { leagueId, actorId: owner, epoch: 1, wraps: wrapsFor([stranger]) })).rejects.toBeInstanceOf(ValidationError)
    const u2 = await makeUser(db, 'u2')
    await addLeagueMember(db, leagueId, u2)
    expect(await addWrappedKeys(db, { leagueId, actorId: owner, epoch: 1, wraps: wrapsFor([u2]) })).toEqual({ added: 1 })
    expect(await getMyWrappedKey(db, leagueId, u2, 1)).toBe('wk-u2')
    // Idempotent: re-wrapping the same member at the same epoch adds nothing.
    expect(await addWrappedKeys(db, { leagueId, actorId: owner, epoch: 1, wraps: wrapsFor([u2]) })).toEqual({ added: 0 })
    await client.close()
  })
})

describe('postMessage', () => {
  it('validates the ciphertext', async () => {
    const { db, client, owner, leagueId } = await setup()
    await expect(postMessage(db, { leagueId, userId: owner, ciphertext: '', epoch: 1 })).rejects.toBeInstanceOf(ValidationError)
    await expect(
      postMessage(db, { leagueId, userId: owner, ciphertext: 'x'.repeat(16_385), epoch: 1 }),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('throws NotFound for an unknown league', async () => {
    const { db, client, owner } = await setup()
    await expect(postMessage(db, { leagueId: 'nope', userId: owner, ciphertext: 'c', epoch: 1 })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('forbids non-members and posting while disabled', async () => {
    const { db, client, owner, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(postMessage(db, { leagueId, userId: stranger, ciphertext: 'c', epoch: 0 })).rejects.toBeInstanceOf(ForbiddenError)
    // Member, but chat not enabled yet.
    await expect(postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 0 })).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('conflicts on a stale epoch', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    await expect(postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 2 })).rejects.toBeInstanceOf(ConflictError)
    await client.close()
  })

  it('posts to the league room and to a match thread', async () => {
    const { db, client, owner, leagueId, competitionId, roundId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const room = await postMessage(db, { leagueId, userId: owner, ciphertext: 'hello', epoch: 1 })
    expect(room.matchId).toBeNull()
    expect(room.userId).toBe(owner)
    expect(room.ciphertext).toBe('hello')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-10T10:00:00Z') })
    const thread = await postMessage(db, { leagueId, userId: owner, matchId: m, ciphertext: 'on the match', epoch: 1 })
    expect(thread.matchId).toBe(m)
    await client.close()
  })

  it('threads a reply to a same-room parent and rejects a cross-room parent', async () => {
    const { db, client, owner, leagueId, competitionId, roundId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const parent = await postMessage(db, { leagueId, userId: owner, ciphertext: 'p', epoch: 1 })
    const reply = await postMessage(db, { leagueId, userId: owner, ciphertext: 'r', epoch: 1, parentId: parent.id })
    expect(reply.parentId).toBe(parent.id)
    // A match-thread message can't be quoted from the league room.
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-10T10:00:00Z') })
    const threadMsg = await postMessage(db, { leagueId, userId: owner, matchId: m, ciphertext: 't', epoch: 1 })
    await expect(
      postMessage(db, { leagueId, userId: owner, ciphertext: 'x', epoch: 1, parentId: threadMsg.id }),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('rejects a match thread for an unknown or cross-competition match', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    await expect(postMessage(db, { leagueId, userId: owner, matchId: 'nope', ciphertext: 'c', epoch: 1 })).rejects.toBeInstanceOf(ValidationError)
    const otherComp = await seedCompetition(db)
    const otherRound = (await findRoundId(db, otherComp, 'GROUP', 1)) as string
    const otherMatch = await makeMatch(db, { competitionId: otherComp, roundId: otherRound, kickoffTime: new Date('2026-06-10T10:00:00Z') })
    await expect(postMessage(db, { leagueId, userId: owner, matchId: otherMatch, ciphertext: 'c', epoch: 1 })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })
})

describe('editMessage', () => {
  it('edits the author own visible message and stamps editedAt', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const m = await postMessage(db, { leagueId, userId: owner, ciphertext: 'orig', epoch: 1 })
    const res = await editMessage(db, { leagueId, messageId: m.id, userId: owner, ciphertext: 'edited-ct' })
    expect(res.editedAt).toBeInstanceOf(Date)
    const row = (await listMessages(db, { leagueId, userId: owner })).find((r) => r.id === m.id)!
    expect(row.ciphertext).toBe('edited-ct')
    expect(row.editedAt).not.toBeNull()
    await client.close()
  })

  it('forbids editing another member message and 404s an unknown one', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const m = await postMessage(db, { leagueId, userId: owner, ciphertext: 'orig', epoch: 1 })
    const other = await makeUser(db, 'other2')
    await addLeagueMember(db, leagueId, other)
    await expect(editMessage(db, { leagueId, messageId: m.id, userId: other, ciphertext: 'x' })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(
      editMessage(db, { leagueId, messageId: '00000000-0000-0000-0000-000000000000', userId: owner, ciphertext: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('rejects editing a removed message', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const m = await postMessage(db, { leagueId, userId: owner, ciphertext: 'orig', epoch: 1 })
    await db.update(chatMessage).set({ moderationState: 'REMOVED' }).where(eq(chatMessage.id, m.id))
    await expect(editMessage(db, { leagueId, messageId: m.id, userId: owner, ciphertext: 'x' })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('rejects an empty or oversized edit ciphertext', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const m = await postMessage(db, { leagueId, userId: owner, ciphertext: 'orig', epoch: 1 })
    await expect(editMessage(db, { leagueId, messageId: m.id, userId: owner, ciphertext: '' })).rejects.toBeInstanceOf(ValidationError)
    await expect(
      editMessage(db, { leagueId, messageId: m.id, userId: owner, ciphertext: 'x'.repeat(16_385) }),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('drops and appends images on edit, keeping idx stable and the cap enforced', async () => {
    const { db, client, owner, leagueId, storage } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const m = await postMessage(
      db,
      {
        leagueId,
        userId: owner,
        ciphertext: 'orig',
        epoch: 1,
        images: [
          { ciphertext: 'A', byteSize: 1 },
          { ciphertext: 'B', byteSize: 1 },
          { ciphertext: 'C', byteSize: 1 },
        ],
      },
      storage,
    )
    // Drop idx 1, append one new image: survivors keep their idx, the new one
    // appends after the highest surviving idx.
    const res = await editMessage(
      db,
      {
        leagueId,
        messageId: m.id,
        userId: owner,
        ciphertext: 'edited',
        removeIdxs: [1],
        addImages: [{ ciphertext: 'D', byteSize: 1 }],
      },
      storage,
    )
    expect(res.attachments).toEqual([
      { idx: 0, epoch: 1 },
      { idx: 2, epoch: 1 },
      { idx: 3, epoch: 1 },
    ])
    const got = await getMessageAttachments(db, [m.id])
    expect(got.get(m.id)).toEqual([
      { idx: 0, epoch: 1 },
      { idx: 2, epoch: 1 },
      { idx: 3, epoch: 1 },
    ])
    // The blob at idx 0 is untouched; idx 1 is gone; idx 3 holds the appended image.
    expect((await getAttachmentCiphertext(db, m.id, 0, owner, storage)).ciphertext).toBe('A')
    await expect(getAttachmentCiphertext(db, m.id, 1, owner, storage)).rejects.toBeInstanceOf(NotFoundError)
    expect((await getAttachmentCiphertext(db, m.id, 3, owner, storage)).ciphertext).toBe('D')
    // The dropped image's object is gone from storage too (not just the row).
    expect(storage.store.has(`chat/${m.id}/1`)).toBe(false)
    // Exceeding the cap on edit is rejected (3 kept + 4 new > 6).
    await expect(
      editMessage(
        db,
        {
          leagueId,
          messageId: m.id,
          userId: owner,
          ciphertext: 'edited',
          addImages: Array.from({ length: 4 }, (_, i) => ({ ciphertext: `n${i}`, byteSize: 1 })),
        },
        storage,
      ),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })
})

describe('listMessages', () => {
  it('forbids non-members', async () => {
    const { db, client, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(listMessages(db, { leagueId, userId: stranger })).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('returns the room newest-first and paginates with before', async () => {
    const { db, client, owner, leagueId, competitionId, roundId } = await setup()
    const t = (s: number) => new Date(`2026-06-10T10:0${s}:00Z`)
    await db.insert(chatMessage).values([
      { leagueId, userId: owner, epoch: 1, ciphertext: 'm1', createdAt: t(1) },
      { leagueId, userId: owner, epoch: 1, ciphertext: 'm2', createdAt: t(2) },
      { leagueId, userId: owner, epoch: 1, ciphertext: 'm3', createdAt: t(3) },
    ])
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: t(1) })
    await db.insert(chatMessage).values({ leagueId, matchId: m, userId: owner, epoch: 1, ciphertext: 'thread', createdAt: t(4) })

    const room = await listMessages(db, { leagueId, userId: owner })
    expect(room.map((r) => r.ciphertext)).toEqual(['m3', 'm2', 'm1']) // newest first, league room only
    const page = await listMessages(db, { leagueId, userId: owner, limit: 2 })
    expect(page.map((r) => r.ciphertext)).toEqual(['m3', 'm2'])
    const older = await listMessages(db, { leagueId, userId: owner, before: t(2) })
    expect(older.map((r) => r.ciphertext)).toEqual(['m1'])
    const thread = await listMessages(db, { leagueId, userId: owner, matchId: m })
    expect(thread.map((r) => r.ciphertext)).toEqual(['thread'])
    await client.close()
  })

  it('clamps the page size into [1, MAX_PAGE]', async () => {
    const { db, client, owner, leagueId } = await setup()
    const t = (s: number) => new Date(`2026-06-10T10:0${s}:00Z`)
    await db.insert(chatMessage).values([
      { leagueId, userId: owner, epoch: 1, ciphertext: 'm1', createdAt: t(1) },
      { leagueId, userId: owner, epoch: 1, ciphertext: 'm2', createdAt: t(2) },
    ])
    expect((await listMessages(db, { leagueId, userId: owner, limit: 0 })).length).toBe(1) // clamped up to 1
    expect((await listMessages(db, { leagueId, userId: owner, limit: 9999 })).map((r) => r.ciphertext)).toEqual(['m2', 'm1']) // clamped down, all returned
    await client.close()
  })

  it('keeps quotes in the room list but hides thread replies, returned in thread mode', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const root = await postMessage(db, { leagueId, userId: owner, ciphertext: 'root', epoch: 1 })
    // A quote (parentId) stays in the main list; thread replies (threadId) do not.
    await postMessage(db, { leagueId, userId: owner, ciphertext: 'quote', epoch: 1, parentId: root.id })
    await postMessage(db, { leagueId, userId: owner, ciphertext: 't1', epoch: 1, threadId: root.id })
    await postMessage(db, { leagueId, userId: owner, ciphertext: 't2', epoch: 1, threadId: root.id })

    const room = await listMessages(db, { leagueId, userId: owner })
    expect(room.map((r) => r.ciphertext).sort()).toEqual(['quote', 'root']) // thread replies excluded
    const thread = await listMessages(db, { leagueId, userId: owner, thread: root.id })
    expect(thread.map((r) => r.ciphertext)).toEqual(['t1', 't2']) // oldest-first
    await client.close()
  })
})

describe('getUserLeagueIds', () => {
  it('returns the leagues a user belongs to, and nothing for a stranger', async () => {
    const { db, client, owner, leagueId, competitionId } = await setup()
    const second = await makeLeague(db, { competitionId, ownerId: owner })
    expect((await getUserLeagueIds(db, owner)).sort()).toEqual([leagueId, second].sort())
    const stranger = await makeUser(db, 'stranger')
    expect(await getUserLeagueIds(db, stranger)).toEqual([])
    await client.close()
  })
})

describe('getThreadCounts', () => {
  it('counts non-removed thread replies per root, ignoring roots with none', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const a = await postMessage(db, { leagueId, userId: owner, ciphertext: 'a', epoch: 1 })
    const b = await postMessage(db, { leagueId, userId: owner, ciphertext: 'b', epoch: 1 })
    await postMessage(db, { leagueId, userId: owner, ciphertext: 'a-t1', epoch: 1, threadId: a.id })
    const removed = await postMessage(db, { leagueId, userId: owner, ciphertext: 'a-t2', epoch: 1, threadId: a.id })
    await db.update(chatMessage).set({ moderationState: 'REMOVED' }).where(eq(chatMessage.id, removed.id))

    const counts = await getThreadCounts(db, [a.id, b.id])
    expect(counts[a.id]).toBe(1) // the removed reply is not counted
    expect(counts[b.id]).toBeUndefined() // no thread
    expect(await getThreadCounts(db, [])).toEqual({})
    await client.close()
  })
})

describe('requestChatRekey', () => {
  it('throws NotFound for a non-member or an unknown league', async () => {
    const { db, client, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(requestChatRekey(db, leagueId, stranger)).rejects.toBeInstanceOf(NotFoundError)
    await expect(requestChatRekey(db, 'nope', stranger)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('does not request while chat is disabled', async () => {
    const { db, client, owner, leagueId } = await setup()
    expect(await requestChatRekey(db, leagueId, owner)).toEqual({ requested: false, epoch: 0 })
    await client.close()
  })

  it('requests only when the member is missing the current key', async () => {
    const { db, client, owner, leagueId } = await setup()
    const newbie = await makeUser(db, 'newbie')
    await addLeagueMember(db, leagueId, newbie)
    await enableWith(db, leagueId, owner, [owner]) // seals the key to the owner only, epoch 1
    expect(await requestChatRekey(db, leagueId, owner)).toEqual({ requested: false, epoch: 1 }) // owner holds it
    expect(await requestChatRekey(db, leagueId, newbie)).toEqual({ requested: true, epoch: 1 }) // newbie has none
    await client.close()
  })
})
