import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { registerChatIdentity } from '../chat/service'
import { verifyKtChain, loggedKeyFor, KT_GENESIS } from '#shared/key-transparency'
import { appendKeyBinding, getKtHead, getKtLog } from './service'

describe('key-transparency service', () => {
  it('an empty log has the genesis head', async () => {
    const { db, client } = await createTestDb()
    expect(await getKtHead(db)).toEqual({ seq: -1, hash: KT_GENESIS })
    expect((await getKtLog(db)).entries).toEqual([])
    await client.close()
  })

  it('registering a chat identity appends a verifiable, chained entry', async () => {
    const { db, client } = await createTestDb()
    const a = await makeUser(db, 'a')
    const b = await makeUser(db, 'b')
    await registerChatIdentity(db, a, 'pk-a')
    await registerChatIdentity(db, b, 'pk-b')

    const { entries, head } = await getKtLog(db)
    expect(entries.map((e) => [e.seq, e.userId, e.publicKey])).toEqual([
      [0, a, 'pk-a'],
      [1, b, 'pk-b'],
    ])
    const v = await verifyKtChain(entries)
    expect(v.ok).toBe(true)
    expect(v.head).toBe(head.hash)
    expect(loggedKeyFor(entries, b)).toBe('pk-b')
    await client.close()
  })

  it('does not double-log a repeat registration (identity already exists)', async () => {
    const { db, client } = await createTestDb()
    const a = await makeUser(db, 'a')
    const first = await registerChatIdentity(db, a, 'pk-a')
    const second = await registerChatIdentity(db, a, 'pk-a-different')
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    const { entries } = await getKtLog(db)
    expect(entries).toHaveLength(1)
    expect(entries[0].publicKey).toBe('pk-a') // the original binding stands
    await client.close()
  })

  it('appendKeyBinding chains multiple bindings with correct prev-links', async () => {
    const { db, client } = await createTestDb()
    await appendKeyBinding(db, 'u1', 'k1', new Date('2026-06-01T00:00:00.000Z'))
    await appendKeyBinding(db, 'u2', 'k2', new Date('2026-06-02T00:00:00.000Z'))
    const { entries, head } = await getKtLog(db)
    expect(entries[0].prevHash).toBe(KT_GENESIS)
    expect(entries[1].prevHash).toBe(entries[0].entryHash)
    expect(head).toEqual({ seq: 1, hash: entries[1].entryHash })
    expect((await verifyKtChain(entries)).ok).toBe(true)
    await client.close()
  })
})
