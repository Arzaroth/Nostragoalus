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

async function fetchAllEntries(signal?: AbortSignal) {
  const entries: LedgerEntry[] = []
  let afterSeq = 0
  let head = { seq: 0, headHash: COMMITMENT_GENESIS }
  for (;;) {
    const page = await $fetch<ChainPageDTO>('/api/commitments', { params: { afterSeq, limit: 1000 }, signal })
    entries.push(...page.entries)
    head = page.head
    if (page.nextSeq === null) break
    afterSeq = page.nextSeq
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
    queryFn: async ({ signal }): Promise<LedgerVerification> => {
      const { entries, head } = await fetchAllEntries(signal)
      const result = await verifyLedger(entries)
      const openedCount = entries.filter((e) => e.opened).length
      return { entries, head, result: { ...result, ok: result.ok && result.head === head.headHash }, openedCount }
    },
  })
}
