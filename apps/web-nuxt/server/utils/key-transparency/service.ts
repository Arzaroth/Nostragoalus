import { asc, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { keyTransparencyEntry, keyTransparencyHead } from '../../../db/schema'
import { KT_GENESIS, computeKtEntryHash, type KtEntry } from '#shared/key-transparency'

const HEAD_ID = 'singleton'

export interface KtHead {
  seq: number
  hash: string
}

const EMPTY_HEAD: KtHead = { seq: -1, hash: KT_GENESIS }

// Append a (userId -> publicKey) binding to the key-transparency chain. Serialized
// via a FOR UPDATE lock on the singleton head row so concurrent enrolments can't
// fork the chain; the server-set timestamp is folded into the entry hash so the
// ordering is pinned. Called once, when a chat identity is first created.
export async function appendKeyBinding(
  db: AppDatabase,
  userId: string,
  publicKey: string,
  now: Date = new Date(),
): Promise<void> {
  await db.transaction((tx) => appendKeyBindingTx(tx, userId, publicKey, now))
}

// The append body without its own transaction, so a caller that must bind the KT
// entry atomically to some other write (e.g. the chat-identity insert) can run both
// inside one transaction - then a lost genesis race or transient failure rolls the
// whole thing back rather than orphaning an identity that has no log entry.
export async function appendKeyBindingTx(
  tx: AppDatabase,
  userId: string,
  publicKey: string,
  now: Date = new Date(),
): Promise<void> {
  const [head] = await tx.select().from(keyTransparencyHead).where(eq(keyTransparencyHead.id, HEAD_ID)).for('update')
  const prevHash = head?.headHash ?? KT_GENESIS
  const seq = head ? head.seq + 1 : 0
  // Fold the exact ISO string the log will later serve, so the client recomputes
  // the same hash (JS Date is ms precision; the timestamptz round-trips it).
  const entryHash = await computeKtEntryHash({ seq, prevHash, userId, publicKey, createdAt: now.toISOString() })
  await tx.insert(keyTransparencyEntry).values({ seq, userId, publicKey, prevHash, entryHash, createdAt: now })
  if (head) {
    await tx
      .update(keyTransparencyHead)
      .set({ seq, headHash: entryHash, updatedAt: now })
      .where(eq(keyTransparencyHead.id, HEAD_ID))
  } else {
    await tx.insert(keyTransparencyHead).values({ id: HEAD_ID, seq, headHash: entryHash, updatedAt: now })
  }
}

export async function getKtHead(db: AppDatabase): Promise<KtHead> {
  const [head] = await db.select().from(keyTransparencyHead).where(eq(keyTransparencyHead.id, HEAD_ID))
  return head ? { seq: head.seq, hash: head.headHash } : EMPTY_HEAD
}

export async function getKtLog(db: AppDatabase): Promise<{ entries: KtEntry[]; head: KtHead }> {
  const rows = await db.select().from(keyTransparencyEntry).orderBy(asc(keyTransparencyEntry.seq))
  const entries: KtEntry[] = rows.map((r) => ({
    seq: r.seq,
    prevHash: r.prevHash,
    userId: r.userId,
    publicKey: r.publicKey,
    createdAt: r.createdAt.toISOString(),
    entryHash: r.entryHash,
  }))
  return { entries, head: await getKtHead(db) }
}
