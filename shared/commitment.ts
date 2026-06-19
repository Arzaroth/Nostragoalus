// Isomorphic crypto for the commit-reveal prediction ledger. Pure and
// browser-safe (Web Crypto), so the exact same verification runs server-side and
// on the public verify page. The ledger shape lives in db/app-schema.ts
// (predictionCommitment); the chain semantics are documented there.

// Empty-chain head: the prevHash of the very first entry.
export const COMMITMENT_GENESIS = '0'.repeat(64)

const SUBJECT_PREFIX = 'ngc-subject-v1:'
const COMMIT_PREFIX = 'ngc-commit-v1:'
const CHAIN_PREFIX = 'ngc-chain-v1:'

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Stable pseudonym for a user: the ledger commits to this, never the raw id, so
// the public reveal proves chain integrity without deanonymizing the predictor.
export async function computeSubject(userId: string): Promise<string> {
  return sha256Hex(SUBJECT_PREFIX + userId)
}

export interface CommitmentOpening {
  subject: string
  matchId: string
  homeGoals: number
  awayGoals: number
  salt: string
}

// The salted commitment to one pick. The salt keeps the pick hidden while the
// commitment is already public (pre-kickoff): the 100x100 score space is trivial
// to brute-force, a 256-bit salt is not.
export async function computeCommitment(o: CommitmentOpening): Promise<string> {
  return sha256Hex(COMMIT_PREFIX + [o.subject, o.matchId, o.homeGoals, o.awayGoals, o.salt].join(':'))
}

export interface ChainLink {
  seq: number
  prevHash: string
  commitment: string
  subject: string
  matchId: string
  createdAt: string
}

// One link's hash folds in the previous head, welding the chain: change any past
// field and every later entryHash stops matching.
export async function computeEntryHash(l: ChainLink): Promise<string> {
  return sha256Hex(CHAIN_PREFIX + [l.seq, l.prevHash, l.commitment, l.subject, l.matchId, l.createdAt].join(':'))
}

export interface LedgerEntry extends ChainLink {
  entryHash: string
  // True once the entry's match has kicked off: the opening below is then public
  // and the commitment can be re-derived. Before that only the links verify.
  opened: boolean
  homeGoals?: number
  awayGoals?: number
  salt?: string
}

export type VerifyFailure = 'sequence' | 'link' | 'commitment' | 'entry-hash'

export interface VerifyResult {
  ok: boolean
  count: number
  // Running head after the last verified entry (or expectedPrev for an empty
  // slice). A caller compares this to the published chain head.
  head: string
  failedSeq?: number
  reason?: VerifyFailure
}

// Walk an ordered ledger slice and prove every link. `expectedPrev` is the head
// the first entry must chain from (GENESIS for a from-scratch walk). Stops at the
// first inconsistency and reports which check failed.
export async function verifyLedger(
  entries: LedgerEntry[],
  expectedPrev: string = COMMITMENT_GENESIS,
): Promise<VerifyResult> {
  let prev = expectedPrev
  let expectedSeq: number | null = null
  for (const e of entries) {
    if (expectedSeq !== null && e.seq !== expectedSeq) {
      return { ok: false, count: entries.length, head: prev, failedSeq: e.seq, reason: 'sequence' }
    }
    if (e.prevHash !== prev) {
      return { ok: false, count: entries.length, head: prev, failedSeq: e.seq, reason: 'link' }
    }
    if (e.opened) {
      const commitment = await computeCommitment({
        subject: e.subject,
        matchId: e.matchId,
        homeGoals: e.homeGoals as number,
        awayGoals: e.awayGoals as number,
        salt: e.salt as string,
      })
      if (commitment !== e.commitment) {
        return { ok: false, count: entries.length, head: prev, failedSeq: e.seq, reason: 'commitment' }
      }
    }
    const entryHash = await computeEntryHash(e)
    if (entryHash !== e.entryHash) {
      return { ok: false, count: entries.length, head: prev, failedSeq: e.seq, reason: 'entry-hash' }
    }
    prev = e.entryHash
    expectedSeq = e.seq + 1
  }
  return { ok: true, count: entries.length, head: prev }
}
