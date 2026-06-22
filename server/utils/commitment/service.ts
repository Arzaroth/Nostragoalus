import { randomBytes } from 'node:crypto'
import { asc, eq, gt } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { commitmentChainHead, match, predictionCommitment } from '../../../db/schema'
import {
  COMMITMENT_GENESIS,
  computeCommitment,
  computeEntryHash,
  computeSubject,
  type LedgerEntry,
  type VerifyFailure,
  verifyLedger,
} from '../../../shared/commitment'

const HEAD_ID = 'singleton'
const MAX_PAGE = 1000
const DEFAULT_PAGE = 500

export interface AppendCommitmentInput {
  predictionId: string
  userId: string
  matchId: string
  homeGoals: number
  awayGoals: number
}

// Append one immutable, hash-chained commitment for a pick change. MUST run in
// the same transaction as the prediction write so the pick and its commitment
// commit (or roll back) together. The head row is locked FOR UPDATE so
// concurrent saves serialize and the chain can never fork - including the very
// first append, which seeds the singleton head row first so FOR UPDATE always
// has a row to lock (otherwise two genesis saves would both read no head, both
// claim seq 1, and the loser would hard-fail on the seq primary key).
export async function appendPredictionCommitment(
  db: AppDatabase,
  input: AppendCommitmentInput,
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(commitmentChainHead)
    .values({ id: HEAD_ID, seq: 0, headHash: COMMITMENT_GENESIS, updatedAt: now })
    .onConflictDoNothing()
  const [head] = await db
    .select()
    .from(commitmentChainHead)
    .where(eq(commitmentChainHead.id, HEAD_ID))
    .for('update')
  const prevHash = head?.headHash ?? COMMITMENT_GENESIS
  const seq = (head?.seq ?? 0) + 1

  const subject = await computeSubject(input.userId)
  const salt = randomBytes(32).toString('hex')
  const createdAt = now.toISOString()
  const commitment = await computeCommitment({
    subject,
    matchId: input.matchId,
    homeGoals: input.homeGoals,
    awayGoals: input.awayGoals,
    salt,
  })
  const entryHash = await computeEntryHash({ seq, prevHash, commitment, subject, matchId: input.matchId, createdAt })

  await db.insert(predictionCommitment).values({
    seq,
    predictionId: input.predictionId,
    userId: input.userId,
    subject,
    matchId: input.matchId,
    homeGoals: input.homeGoals,
    awayGoals: input.awayGoals,
    salt,
    commitment,
    prevHash,
    entryHash,
    createdAt: now,
  })

  await db
    .insert(commitmentChainHead)
    .values({ id: HEAD_ID, seq, headHash: entryHash, updatedAt: now })
    .onConflictDoUpdate({ target: commitmentChainHead.id, set: { seq, headHash: entryHash, updatedAt: now } })
}

export interface ChainHead {
  seq: number
  headHash: string
  updatedAt: Date | null
}

export async function getChainHead(db: AppDatabase): Promise<ChainHead> {
  const [head] = await db.select().from(commitmentChainHead).where(eq(commitmentChainHead.id, HEAD_ID))
  if (!head) return { seq: 0, headHash: COMMITMENT_GENESIS, updatedAt: null }
  return { seq: head.seq, headHash: head.headHash, updatedAt: head.updatedAt }
}

export interface ChainPage {
  entries: LedgerEntry[]
  head: { seq: number; headHash: string }
  // Cursor for the next page, or null when this page is the tail.
  nextSeq: number | null
}

// A page of the public ledger. The opening (homeGoals/awayGoals/salt) is included
// only for entries whose match has kicked off; before that the entry carries just
// its commitment and chain links so the public can verify integrity without
// learning the pick.
export async function getCommitmentChain(
  db: AppDatabase,
  opts: { afterSeq?: number; limit?: number } = {},
  now: Date = new Date(),
): Promise<ChainPage> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE, 1), MAX_PAGE)
  const afterSeq = opts.afterSeq ?? 0
  // Read the page rows and the chain head in one read-only snapshot. Otherwise a
  // commitment appended between the two reads would leave the served head ahead
  // of the entries, and the client (which compares its walked head to the served
  // head) would flag a perfectly honest, concurrently-growing ledger as tampered.
  const { rows, head } = await db.transaction(
    async (tx) => {
      const rows = await tx
        .select({
          seq: predictionCommitment.seq,
          prevHash: predictionCommitment.prevHash,
          commitment: predictionCommitment.commitment,
          entryHash: predictionCommitment.entryHash,
          subject: predictionCommitment.subject,
          matchId: predictionCommitment.matchId,
          createdAt: predictionCommitment.createdAt,
          homeGoals: predictionCommitment.homeGoals,
          awayGoals: predictionCommitment.awayGoals,
          salt: predictionCommitment.salt,
          kickoffTime: match.kickoffTime,
        })
        .from(predictionCommitment)
        .leftJoin(match, eq(match.id, predictionCommitment.matchId))
        .where(gt(predictionCommitment.seq, afterSeq))
        .orderBy(asc(predictionCommitment.seq))
        .limit(limit + 1)
      return { rows, head: await getChainHead(tx) }
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  )

  const pageRows = rows.slice(0, limit)
  const nextSeq = rows.length > limit ? pageRows[pageRows.length - 1].seq : null
  const entries = pageRows.map((r): LedgerEntry => {
    const opened = r.kickoffTime !== null && r.kickoffTime <= now
    const entry: LedgerEntry = {
      seq: r.seq,
      prevHash: r.prevHash,
      commitment: r.commitment,
      entryHash: r.entryHash,
      subject: r.subject,
      matchId: r.matchId,
      createdAt: r.createdAt.toISOString(),
      opened,
    }
    if (opened) {
      entry.homeGoals = r.homeGoals
      entry.awayGoals = r.awayGoals
      entry.salt = r.salt
    }
    return entry
  })
  return { entries, head: { seq: head.seq, headHash: head.headHash }, nextSeq }
}

export interface ServerVerifyResult {
  ok: boolean
  verified: number
  head: string
  failedSeq?: number
  reason?: VerifyFailure
}

// Server-side self-audit: walk the whole ledger in pages, prove every link and
// every opened commitment, and confirm the walked head equals the stored head.
export async function verifyChainServer(
  db: AppDatabase,
  now: Date = new Date(),
  pageSize: number = MAX_PAGE,
): Promise<ServerVerifyResult> {
  let afterSeq = 0
  let prev = COMMITMENT_GENESIS
  let verified = 0
  // The head taken from each page is snapshot-consistent with that page's
  // entries (getCommitmentChain reads both together), so the last page's head is
  // the one the walk must reproduce - no separate, skew-prone head read.
  let head = COMMITMENT_GENESIS
  for (;;) {
    const page = await getCommitmentChain(db, { afterSeq, limit: pageSize }, now)
    const res = await verifyLedger(page.entries, prev)
    if (!res.ok) return { ok: false, verified, head: prev, failedSeq: res.failedSeq, reason: res.reason }
    verified += res.count
    prev = res.head
    head = page.head.headHash
    if (page.nextSeq === null) break
    afterSeq = page.nextSeq
  }
  return { ok: prev === head, verified, head }
}
