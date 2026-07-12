import { describe, it, expect } from 'vitest'
import { KT_GENESIS, computeKtEntryHash, verifyKtChain, loggedKeyFor, type KtEntry } from './key-transparency'

async function buildChain(rows: { userId: string; publicKey: string; createdAt: string }[]): Promise<KtEntry[]> {
  const out: KtEntry[] = []
  let prev = KT_GENESIS
  for (let i = 0; i < rows.length; i++) {
    const link = { seq: i, prevHash: prev, userId: rows[i].userId, publicKey: rows[i].publicKey, createdAt: rows[i].createdAt }
    const entryHash = await computeKtEntryHash(link)
    out.push({ ...link, entryHash })
    prev = entryHash
  }
  return out
}

const rows = [
  { userId: 'alice', publicKey: 'pk-alice', createdAt: '2026-06-01T00:00:00.000Z' },
  { userId: 'bob', publicKey: 'pk-bob', createdAt: '2026-06-02T00:00:00.000Z' },
  { userId: 'carol', publicKey: 'pk-carol', createdAt: '2026-06-03T00:00:00.000Z' },
]

describe('key-transparency chain', () => {
  it('verifies a well-formed chain and returns its head', async () => {
    const chain = await buildChain(rows)
    const r = await verifyKtChain(chain)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(3)
    expect(r.head).toBe(chain[2].entryHash)
  })

  it('an empty chain verifies to the genesis head', async () => {
    const r = await verifyKtChain([])
    expect(r).toEqual({ ok: true, count: 0, head: KT_GENESIS })
  })

  it('detects a tampered public key (entry-hash mismatch)', async () => {
    const chain = await buildChain(rows)
    // A server swaps bob's key but leaves the stored entryHash untouched.
    chain[1] = { ...chain[1], publicKey: 'pk-attacker' }
    const r = await verifyKtChain(chain)
    expect(r.ok).toBe(false)
    expect(r.failure).toBe('entry-hash')
    expect(r.count).toBe(1)
  })

  it('detects a broken link even when each entryHash is self-consistent', async () => {
    const chain = await buildChain(rows)
    // Rebuild entry 1 as a self-consistent link off a forged prevHash: its own
    // hash matches, but it no longer chains to entry 0's head.
    const forged = { seq: 1, prevHash: 'f'.repeat(64), userId: 'bob', publicKey: 'pk-bob', createdAt: rows[1].createdAt }
    chain[1] = { ...forged, entryHash: await computeKtEntryHash(forged) }
    const r = await verifyKtChain(chain)
    expect(r.ok).toBe(false)
    expect(r.failure).toBe('link')
  })

  it('detects an out-of-order sequence', async () => {
    const chain = await buildChain(rows)
    const swapped = [chain[0], chain[2], chain[1]]
    const r = await verifyKtChain(swapped)
    expect(r.ok).toBe(false)
    expect(r.failure).toBe('sequence') // entry with seq 2 sits at index 1
  })

  it('loggedKeyFor returns the latest key for a user, or null', async () => {
    const chain = await buildChain([...rows, { userId: 'alice', publicKey: 'pk-alice-2', createdAt: '2026-06-04T00:00:00.000Z' }])
    expect(loggedKeyFor(chain, 'alice')).toBe('pk-alice-2')
    expect(loggedKeyFor(chain, 'bob')).toBe('pk-bob')
    expect(loggedKeyFor(chain, 'nobody')).toBeNull()
  })
})
