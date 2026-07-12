// Input cases for the key-transparency (KT) log parity vectors. Pure SHA-256
// hash chain, same construction as the commitment ledger; bless manufactures
// concrete entries so the frozen args replay with no builder.
import { computeKtEntryHash, KT_GENESIS, type KtEntry } from '#shared/key-transparency'

interface RawCase {
  fn: string
  args: unknown[]
}

const ISO1 = '2026-06-19T10:00:00.000Z'
const ISO2 = '2026-06-19T11:00:00.000Z'

async function makeKtEntry(seq: number, prevHash: string, userId: string, publicKey: string, createdAt: string): Promise<KtEntry> {
  const entryHash = await computeKtEntryHash({ seq, prevHash, userId, publicKey, createdAt })
  return { seq, prevHash, userId, publicKey, createdAt, entryHash }
}

export async function buildCases(): Promise<RawCase[]> {
  const cases: RawCase[] = []

  cases.push({
    fn: 'computeKtEntryHash',
    args: [{ seq: 0, prevHash: KT_GENESIS, userId: 'u1', publicKey: 'pk-A', createdAt: ISO1 }],
  })

  const e0 = await makeKtEntry(0, KT_GENESIS, 'u1', 'pk-A', ISO1)
  const e1 = await makeKtEntry(1, e0.entryHash, 'u2', 'pk-B', ISO2)
  const e1rot = await makeKtEntry(1, e0.entryHash, 'u1', 'pk-A2', ISO2) // u1 rotates key

  cases.push({ fn: 'verifyKtChain', args: [[]] }) // empty -> genesis head
  cases.push({ fn: 'verifyKtChain', args: [[e0, e1]] }) // valid
  cases.push({ fn: 'verifyKtChain', args: [[e1]] }) // wrong start index -> sequence
  cases.push({ fn: 'verifyKtChain', args: [[e0, { ...e1, prevHash: 'wrong' }]] }) // link
  cases.push({ fn: 'verifyKtChain', args: [[{ ...e0, entryHash: 'f'.repeat(64) }]] }) // entry-hash

  cases.push({ fn: 'loggedKeyFor', args: [[e0, e1], 'u1'] }) // present
  cases.push({ fn: 'loggedKeyFor', args: [[e0, e1rot], 'u1'] }) // rotated -> latest key
  cases.push({ fn: 'loggedKeyFor', args: [[e0, e1], 'nobody'] }) // absent -> null

  return cases
}
