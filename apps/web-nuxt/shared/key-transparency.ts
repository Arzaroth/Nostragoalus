import { sha256Hex } from './commitment'

// Isomorphic primitives for the key-transparency (KT) log: an append-only,
// hash-chained record of every user's chat public key. It lets any client detect
// a server that substitutes a member's key to man-in-the-middle E2EE chat - the
// server must either publish the swap in this public log (visible to everyone who
// downloads it) or serve a member key that isn't in the log (the client flags it).
// The chain is verifiable the same way on the server and in the browser, so the
// exact code below runs in both. It is anchored in-app only (no external witness),
// so a compelled operator who rewrites the whole chain from genesis is caught only
// by a client that pinned an earlier head - not by a fresh visitor.

// prevHash of the very first entry (an empty chain's head).
export const KT_GENESIS = '0'.repeat(64)

const KT_PREFIX = 'ngc-kt-v1:'

export interface KtLink {
  // 0-based position in the chain.
  seq: number
  prevHash: string
  userId: string
  publicKey: string
  // server-set ISO timestamp, folded in so the ordering is pinned
  createdAt: string
}

// One link's hash folds in the previous head: change any past field and every
// later entryHash stops matching (same construction as the commitment ledger).
export async function computeKtEntryHash(l: KtLink): Promise<string> {
  return sha256Hex(KT_PREFIX + [l.seq, l.prevHash, l.userId, l.publicKey, l.createdAt].join(':'))
}

export interface KtEntry extends KtLink {
  entryHash: string
}

export type KtVerifyFailure = 'sequence' | 'link' | 'entry-hash'

export interface KtVerifyResult {
  ok: boolean
  // number of entries verified before a failure (or the full length)
  count: number
  // running head after the last verified entry
  head: string
  failure?: KtVerifyFailure
}

// Recompute the chain from genesis: every entry must be at its sequence index,
// link to the running head, and hash to its stored entryHash. Returns the head so
// a caller can compare it against a pinned value.
export async function verifyKtChain(entries: KtEntry[], genesis: string = KT_GENESIS): Promise<KtVerifyResult> {
  let prev = genesis
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (e.seq !== i) return { ok: false, count: i, head: prev, failure: 'sequence' }
    if (e.prevHash !== prev) return { ok: false, count: i, head: prev, failure: 'link' }
    const h = await computeKtEntryHash(e)
    if (h !== e.entryHash) return { ok: false, count: i, head: prev, failure: 'entry-hash' }
    prev = h
  }
  return { ok: true, count: entries.length, head: prev }
}

// The publicKey recorded for a user in the log (the LAST entry for them, so a
// legitimate key rotation supersedes an older one), or null if absent.
export function loggedKeyFor(entries: KtEntry[], userId: string): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].userId === userId) return entries[i].publicKey
  }
  return null
}
