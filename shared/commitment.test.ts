import { describe, expect, it } from 'vitest'
import {
  COMMITMENT_GENESIS,
  computeCommitment,
  computeEntryHash,
  computeSubject,
  type LedgerEntry,
  sha256Hex,
  verifyLedger,
} from './commitment'

// Build a well-formed ledger entry from its opening so tests can then tamper one
// field at a time and assert which check trips.
async function makeEntry(
  seq: number,
  prevHash: string,
  userId: string,
  matchId: string,
  createdAt: string,
  opening: { homeGoals: number; awayGoals: number; salt: string },
  opened = true,
): Promise<LedgerEntry> {
  const subject = await computeSubject(userId)
  const commitment = await computeCommitment({ subject, matchId, ...opening })
  const entryHash = await computeEntryHash({ seq, prevHash, commitment, subject, matchId, createdAt })
  return { seq, prevHash, commitment, subject, matchId, createdAt, entryHash, opened, ...opening }
}

describe('sha256Hex', () => {
  it('matches the known empty-string vector', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('is deterministic and input-sensitive', async () => {
    expect(await sha256Hex('abc')).toBe(await sha256Hex('abc'))
    expect(await sha256Hex('abc')).not.toBe(await sha256Hex('abd'))
  })
})

describe('computeSubject', () => {
  it('is a stable per-user pseudonym, not the raw id', async () => {
    const s = await computeSubject('user-1')
    expect(s).toBe(await computeSubject('user-1'))
    expect(s).not.toContain('user-1')
    expect(s).not.toBe(await computeSubject('user-2'))
  })
})

describe('computeCommitment', () => {
  it('changes when any opened field changes', async () => {
    const base = { subject: 's', matchId: 'm', homeGoals: 2, awayGoals: 1, salt: 'pepper' }
    const ref = await computeCommitment(base)
    expect(await computeCommitment(base)).toBe(ref)
    expect(await computeCommitment({ ...base, homeGoals: 3 })).not.toBe(ref)
    expect(await computeCommitment({ ...base, awayGoals: 0 })).not.toBe(ref)
    expect(await computeCommitment({ ...base, salt: 'other' })).not.toBe(ref)
    expect(await computeCommitment({ ...base, matchId: 'm2' })).not.toBe(ref)
  })
})

describe('verifyLedger', () => {
  const iso1 = '2026-06-19T10:00:00.000Z'
  const iso2 = '2026-06-19T11:00:00.000Z'

  it('accepts an empty slice and echoes the expected head', async () => {
    expect(await verifyLedger([])).toEqual({ ok: true, count: 0, head: COMMITMENT_GENESIS })
    expect(await verifyLedger([], 'abc')).toEqual({ ok: true, count: 0, head: 'abc' })
  })

  it('verifies a valid chain mixing opened and unopened entries', async () => {
    const e1 = await makeEntry(1, COMMITMENT_GENESIS, 'u1', 'm1', iso1, { homeGoals: 2, awayGoals: 1, salt: 'a' })
    const e2 = await makeEntry(2, e1.entryHash, 'u2', 'm2', iso2, { homeGoals: 0, awayGoals: 0, salt: 'b' }, false)
    const res = await verifyLedger([e1, e2])
    expect(res.ok).toBe(true)
    expect(res.count).toBe(2)
    expect(res.head).toBe(e2.entryHash)
  })

  it('verifies a slice starting mid-chain from a supplied head', async () => {
    const e2 = await makeEntry(2, 'prev-head', 'u1', 'm2', iso2, { homeGoals: 1, awayGoals: 1, salt: 'x' })
    expect((await verifyLedger([e2], 'prev-head')).ok).toBe(true)
  })

  it('flags a sequence gap', async () => {
    const e1 = await makeEntry(1, COMMITMENT_GENESIS, 'u1', 'm1', iso1, { homeGoals: 1, awayGoals: 0, salt: 'a' })
    const e3 = await makeEntry(3, e1.entryHash, 'u1', 'm2', iso2, { homeGoals: 1, awayGoals: 0, salt: 'b' })
    expect(await verifyLedger([e1, e3])).toMatchObject({ ok: false, reason: 'sequence', failedSeq: 3 })
  })

  it('flags a broken link', async () => {
    const e1 = await makeEntry(1, COMMITMENT_GENESIS, 'u1', 'm1', iso1, { homeGoals: 1, awayGoals: 0, salt: 'a' })
    const e2 = await makeEntry(2, 'wrong-prev', 'u1', 'm2', iso2, { homeGoals: 1, awayGoals: 0, salt: 'b' })
    expect(await verifyLedger([e1, e2])).toMatchObject({ ok: false, reason: 'link', failedSeq: 2 })
  })

  it('flags an opened entry whose opening does not match its commitment', async () => {
    const e1 = await makeEntry(1, COMMITMENT_GENESIS, 'u1', 'm1', iso1, { homeGoals: 2, awayGoals: 1, salt: 'a' })
    const tampered: LedgerEntry = { ...e1, homeGoals: 5 }
    expect(await verifyLedger([tampered])).toMatchObject({ ok: false, reason: 'commitment', failedSeq: 1 })
  })

  it('flags a forged entryHash on an unopened entry', async () => {
    const e1 = await makeEntry(1, COMMITMENT_GENESIS, 'u1', 'm1', iso1, { homeGoals: 2, awayGoals: 1, salt: 'a' }, false)
    const tampered: LedgerEntry = { ...e1, commitment: 'f'.repeat(64) }
    expect(await verifyLedger([tampered])).toMatchObject({ ok: false, reason: 'entry-hash', failedSeq: 1 })
  })
})
