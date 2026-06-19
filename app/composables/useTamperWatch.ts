import { type LedgerEntry, type PinnedHead, type WitnessStatus, witnessExtension } from '#shared/commitment'
import type { ChainHeadDTO, ChainPageDTO } from './useCommitments'

const PIN_KEY = 'ng-tamper-pin'

interface StoredPin {
  seq: number
  headHash: string
  firstSeenAt: string
}

function readPin(): StoredPin | null {
  if (!import.meta.client) return null
  try {
    const raw = localStorage.getItem(PIN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.seq === 'number' && typeof parsed?.headHash === 'string' && typeof parsed?.firstSeenAt === 'string') {
      return parsed as StoredPin
    }
    return null
  } catch {
    return null
  }
}

function writePin(pin: StoredPin): void {
  if (!import.meta.client) return
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(pin))
  } catch {
    // Private mode / quota: witnessing degrades to per-session, no need to shout.
  }
}

async function fetchEntriesAfter(afterSeq: number, signal?: AbortSignal): Promise<LedgerEntry[]> {
  const entries: LedgerEntry[] = []
  let cursor = afterSeq
  for (;;) {
    const page = await $fetch<ChainPageDTO>('/api/commitments', { params: { afterSeq: cursor, limit: 1000 }, signal })
    entries.push(...page.entries)
    if (page.nextSeq === null) break
    cursor = page.nextSeq
  }
  return entries
}

export interface TamperWatchState {
  status: WitnessStatus | 'unknown'
  pinnedSeq: number | null
  headSeq: number | null
  firstSeenAt: string | null
  checkedAt: string | null
}

// This device's running witness of the commitment chain. The pinned head lives in
// localStorage (per browser, never sent to the server), so a later visit can prove
// the served chain still extends what this device already saw. The shared state is
// surfaced by the footer warning chip and the /verify page.
export function useTamperWatch() {
  const state = useState<TamperWatchState>('tamper-watch', () => ({
    status: 'unknown',
    pinnedSeq: null,
    headSeq: null,
    firstSeenAt: null,
    checkedAt: null,
  }))

  async function check(): Promise<void> {
    if (!import.meta.client) return
    const stored = readPin()
    const pin: PinnedHead | null = stored ? { seq: stored.seq, headHash: stored.headHash } : null
    try {
      const head = await $fetch<ChainHeadDTO>('/api/commitments/head')
      const servedHead: PinnedHead = { seq: head.seq, headHash: head.headHash }
      const extension = pin && servedHead.seq > pin.seq ? await fetchEntriesAfter(pin.seq) : []
      const result = await witnessExtension(pin, extension, servedHead)
      const firstSeenAt = stored?.firstSeenAt ?? new Date().toISOString()
      // Only advance the pin when the chain proved consistent - never adopt a head
      // that failed to extend what we already trusted.
      if (result.status === 'first-seen' || result.status === 'consistent') {
        writePin({ seq: result.head.seq, headHash: result.head.headHash, firstSeenAt })
      }
      state.value = {
        status: result.status,
        pinnedSeq: pin?.seq ?? null,
        headSeq: servedHead.seq,
        firstSeenAt,
        checkedAt: new Date().toISOString(),
      }
    } catch {
      // Network/endpoint failure must not read as tampering: stay where we were.
      state.value = { ...state.value, checkedAt: new Date().toISOString() }
    }
  }

  const tampered = computed(() => state.value.status === 'tampered' || state.value.status === 'rolled-back')

  return { state, check, tampered }
}
