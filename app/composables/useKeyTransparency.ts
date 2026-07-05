import { useStorage } from '@vueuse/core'
import { verifyKtChain, loggedKeyFor, type KtEntry } from '#shared/key-transparency'

export type KtCheck = 'ok' | 'absent' | 'mismatch' | 'unknown'

interface KtSnapshot {
  entries: KtEntry[]
  // true only when the chain recomputes cleanly AND matches the served head
  chainOk: boolean
  headHash: string
}

// The key-transparency log is app-global (one chat identity per user), so cache the
// verified snapshot module-wide and refresh at most every 30s - the deep member
// watch must not refetch/re-verify the whole log on every recompute.
let cached: { at: number; snap: KtSnapshot } | null = null
let inFlight: Promise<KtSnapshot> | null = null
const TTL_MS = 30_000

async function fetchAndVerify(): Promise<KtSnapshot> {
  const { entries, head } = await $fetch<{ entries: KtEntry[]; head: { seq: number; hash: string } }>('/api/keys/log')
  const v = await verifyKtChain(entries)
  return { entries, chainOk: v.ok && v.head === head.hash, headHash: head.hash }
}

// Verify the log against a locally pinned head so a client that saw an earlier
// state detects a server that rewrote the append-only log (the in-app anchor's
// limit: a brand-new visitor with no pin can't catch a from-genesis rewrite).
export function useKeyTransparency() {
  const entries = ref<KtEntry[]>([])
  const chainOk = ref<boolean | null>(null) // null = not loaded yet
  const headTampered = ref(false)
  const pinnedHead = useStorage<{ hash: string; size: number } | null>('ng-kt-head', null)

  async function ensure(force = false): Promise<void> {
    try {
      const now = pinnedHead.value // touch storage so SSR/client hydrate consistently
      void now
      let snap: KtSnapshot
      const fresh = cached && !force && Date.now() - cached.at < TTL_MS
      if (fresh) {
        snap = cached!.snap
      } else {
        inFlight ??= fetchAndVerify()
        snap = await inFlight
        inFlight = null
        cached = { at: Date.now(), snap }
      }
      entries.value = snap.entries
      chainOk.value = snap.chainOk
      const pin = pinnedHead.value
      if (pin && (snap.entries.length < pin.size || snap.entries[pin.size - 1]?.entryHash !== pin.hash)) {
        // The log shrank, or the entry we pinned changed: an append-only violation.
        headTampered.value = true
      } else if (snap.chainOk) {
        headTampered.value = false
        pinnedHead.value = { hash: snap.headHash, size: snap.entries.length }
      }
    } catch {
      inFlight = null
      chainOk.value = null // transient: leave prior verdict, report unknown
    }
  }

  // How the served key for a user compares to the log: 'mismatch' is the alarm - the
  // server handed a key that is not the one publicly recorded (a substitution).
  function check(userId: string, publicKey: string): KtCheck {
    if (chainOk.value === null) return 'unknown'
    const logged = loggedKeyFor(entries.value, userId)
    if (logged === null) return 'absent'
    return logged === publicKey ? 'ok' : 'mismatch'
  }

  return { ensure, check, chainOk, headTampered, entries }
}

// Test seam: drop the module cache between unit tests.
export function _resetKtCache(): void {
  cached = null
  inFlight = null
}
