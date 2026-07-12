// Input cases for the commitment (commit-reveal ledger) parity vectors. This
// file runs ONLY at bless time: it may call the real impl to manufacture
// concrete, self-contained args (a ledger entry carries literal hashes), so the
// frozen vector needs no builder to replay - Dart feeds the same literal entries
// straight through its own verifyLedger.
import {
  COMMITMENT_GENESIS,
  computeCommitment,
  computeEntryHash,
  computeLeagueCommitment,
  computeLeagueEntryHash,
  computeSubject,
  type LeagueLedgerEntry,
  type LedgerEntry,
} from '#shared/commitment'

interface RawCase {
  fn: string
  args: unknown[]
}

const ISO1 = '2026-06-19T10:00:00.000Z'
const ISO2 = '2026-06-19T11:00:00.000Z'

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

async function makeLeagueEntry(
  seq: number,
  prevHash: string,
  userId: string,
  leagueId: string,
  matchId: string,
  createdAt: string,
  opening: { homeGoals: number; awayGoals: number; salt: string },
  opened = true,
): Promise<LeagueLedgerEntry> {
  const subject = await computeSubject(userId)
  const commitment = await computeLeagueCommitment({ subject, leagueId, matchId, ...opening })
  const entryHash = await computeLeagueEntryHash({ seq, prevHash, commitment, subject, leagueId, matchId, createdAt })
  return { seq, prevHash, commitment, subject, leagueId, matchId, createdAt, entryHash, opened, ...opening }
}

export async function buildCases(): Promise<RawCase[]> {
  const cases: RawCase[] = []

  // --- primitives: string in, hex hash out ---
  cases.push({ fn: 'sha256Hex', args: [''] })
  cases.push({ fn: 'sha256Hex', args: ['abc'] })
  cases.push({ fn: 'sha256Hex', args: ['ngc-parity-éà🌐'] }) // non-ASCII: UTF-8 encoding must match
  cases.push({ fn: 'computeSubject', args: ['user-1'] })
  cases.push({ fn: 'computeSubject', args: ['user-2'] })
  cases.push({
    fn: 'computeCommitment',
    args: [{ subject: 's', matchId: 'm', homeGoals: 2, awayGoals: 1, salt: 'pepper' }],
  })
  cases.push({
    fn: 'computeEntryHash',
    args: [{ seq: 1, prevHash: COMMITMENT_GENESIS, commitment: 'c', subject: 's', matchId: 'm', createdAt: ISO1 }],
  })
  cases.push({
    fn: 'computeLeagueCommitment',
    args: [{ subject: 's', leagueId: 'L1', matchId: 'm', homeGoals: 2, awayGoals: 1, salt: 'pepper' }],
  })
  cases.push({
    fn: 'computeLeagueEntryHash',
    args: [{ seq: 1, prevHash: COMMITMENT_GENESIS, commitment: 'c', subject: 's', leagueId: 'L1', matchId: 'm', createdAt: ISO1 }],
  })

  // --- verifyLedger: the state machine, one case per outcome/reason ---
  const e1 = await makeEntry(1, COMMITMENT_GENESIS, 'u1', 'm1', ISO1, { homeGoals: 2, awayGoals: 1, salt: 'a' })
  const e2 = await makeEntry(2, e1.entryHash, 'u2', 'm2', ISO2, { homeGoals: 0, awayGoals: 0, salt: 'b' }, false)
  cases.push({ fn: 'verifyLedger', args: [[]] }) // empty slice -> genesis head
  cases.push({ fn: 'verifyLedger', args: [[e1, e2]] }) // valid, mixed opened/unopened
  cases.push({ fn: 'verifyLedger', args: [[{ ...e1, homeGoals: 5 }]] }) // bad opening -> reason: commitment
  cases.push({ fn: 'verifyLedger', args: [[{ ...e2, commitment: 'f'.repeat(64) }]] }) // forged hash -> entry-hash
  const gap = await makeEntry(3, e1.entryHash, 'u1', 'm3', ISO2, { homeGoals: 1, awayGoals: 0, salt: 'c' })
  cases.push({ fn: 'verifyLedger', args: [[e1, gap]] }) // seq gap -> reason: sequence
  const badLink = await makeEntry(2, 'wrong-prev', 'u1', 'm2', ISO2, { homeGoals: 1, awayGoals: 0, salt: 'b' })
  cases.push({ fn: 'verifyLedger', args: [[e1, badLink]] }) // broken link -> reason: link

  // --- witnessExtension: the consistency-proof state machine ---
  const w1 = await makeEntry(1, COMMITMENT_GENESIS, 'u1', 'm1', ISO1, { homeGoals: 1, awayGoals: 0, salt: 'a' })
  const w2 = await makeEntry(2, w1.entryHash, 'u1', 'm2', ISO2, { homeGoals: 2, awayGoals: 0, salt: 'b' })
  const w3 = await makeEntry(3, w2.entryHash, 'u1', 'm3', ISO1, { homeGoals: 0, awayGoals: 0, salt: 'c' })
  const w4 = await makeEntry(4, w3.entryHash, 'u1', 'm4', ISO2, { homeGoals: 1, awayGoals: 1, salt: 'd' })
  cases.push({ fn: 'witnessExtension', args: [null, [], { seq: 4, headHash: 'h' }] }) // first-seen
  cases.push({ fn: 'witnessExtension', args: [{ seq: 2, headHash: w2.entryHash }, [], { seq: 2, headHash: w2.entryHash }] }) // consistent
  cases.push({ fn: 'witnessExtension', args: [{ seq: 2, headHash: w2.entryHash }, [], { seq: 2, headHash: 'evil' }] }) // tampered
  cases.push({ fn: 'witnessExtension', args: [{ seq: 5, headHash: 'h5' }, [], { seq: 3, headHash: 'h3' }] }) // rolled-back
  cases.push({ fn: 'witnessExtension', args: [{ seq: 2, headHash: w2.entryHash }, [w3, w4], { seq: 4, headHash: w4.entryHash }] }) // valid extension
  // The three ways an extension is rejected (each OR-clause of the tampered
  // branch), so a Dart port can't pass by only proving the happy path:
  cases.push({ fn: 'witnessExtension', args: [{ seq: 2, headHash: w2.entryHash }, [w4], { seq: 4, headHash: w4.entryHash }] }) // non-contiguous (skips seq 3)
  cases.push({ fn: 'witnessExtension', args: [{ seq: 2, headHash: w2.entryHash }, [{ ...w3, prevHash: 'wrong-prev' }, w4], { seq: 4, headHash: w4.entryHash }] }) // broken link inside extension (verifyLedger fails)
  cases.push({ fn: 'witnessExtension', args: [{ seq: 2, headHash: w2.entryHash }, [w3, w4], { seq: 4, headHash: 'not-the-walked-head' }] }) // walks fine but does not reach the served head

  // --- league ledger: domain-separated twin ---
  const l1 = await makeLeagueEntry(1, COMMITMENT_GENESIS, 'u1', 'L1', 'm1', ISO1, { homeGoals: 2, awayGoals: 1, salt: 'a' })
  const l2 = await makeLeagueEntry(2, l1.entryHash, 'u2', 'L1', 'm2', ISO2, { homeGoals: 0, awayGoals: 0, salt: 'b' }, false)
  cases.push({ fn: 'verifyLeagueLedger', args: [[l1, l2]] })
  cases.push({ fn: 'verifyLeagueLedger', args: [[{ ...l1, homeGoals: 9 }]] })

  return cases
}
