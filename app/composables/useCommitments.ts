import { useQuery } from '@tanstack/vue-query'
import { COMMITMENT_GENESIS, type LedgerEntry, type VerifyResult, verifyLedger } from '#shared/commitment'

export interface ChainHeadDTO {
  seq: number
  headHash: string
  updatedAt: string | null
}

export interface ChainPageDTO {
  entries: LedgerEntry[]
  head: { seq: number; headHash: string }
  nextSeq: number | null
}

export function useCommitmentHead() {
  return useQuery({
    queryKey: ['commitments', 'head'],
    queryFn: ({ signal }) => $fetch<ChainHeadDTO>('/api/commitments/head', { signal }),
  })
}

// Page the ledger from afterSeq to the tail, returning every entry plus the head
// reported by the LAST page. That head is snapshot-consistent with the entries
// (the server reads both together), so a caller can compare its walked head to it
// without a concurrent append producing a false mismatch. Shared by the verify
// page (from genesis) and the per-device witness (from its pin).
export async function fetchLedgerPages(
  afterSeq: number,
  signal?: AbortSignal,
): Promise<{ entries: LedgerEntry[]; head: { seq: number; headHash: string } }> {
  const entries: LedgerEntry[] = []
  let head = { seq: 0, headHash: COMMITMENT_GENESIS }
  let cursor = afterSeq
  for (;;) {
    const page = await $fetch<ChainPageDTO>('/api/commitments', { params: { afterSeq: cursor, limit: 1000 }, signal })
    entries.push(...page.entries)
    head = page.head
    if (page.nextSeq === null) break
    cursor = page.nextSeq
  }
  return { entries, head }
}

export interface LedgerVerification {
  entries: LedgerEntry[]
  head: { seq: number; headHash: string }
  result: VerifyResult
  openedCount: number
}

// Pull the whole ledger and verify it entirely in the browser: the same
// verifyLedger that runs server-side, so the page trusts its own recomputation,
// not a server "ok" flag. ok also requires the walked head to equal the served
// head (catches a truncated or replaced chain).
export function useLedgerVerification() {
  return useQuery({
    queryKey: ['commitments', 'verify'],
    // An explicit "recompute it yourself" action: never serve a stale verdict, so
    // a remount or reverify always re-pulls and re-walks the live ledger.
    staleTime: 0,
    queryFn: async ({ signal }): Promise<LedgerVerification> => {
      const { entries, head } = await fetchLedgerPages(0, signal)
      const result = await verifyLedger(entries)
      const openedCount = entries.filter((e) => e.opened).length
      return { entries, head, result: { ...result, ok: result.ok && result.head === head.headHash }, openedCount }
    },
  })
}
