import { useStorage } from '@vueuse/core'
import { fingerprint } from '~/utils/e2ee'

export interface KeyEntry {
  userId: string
  publicKey: string
  fingerprint: string
  verified: boolean
  changed: boolean
}

// Chat-key trust on this device. Pins each member's public key on first sight
// (trust-on-first-use) and flags it if it later changes, and remembers which
// members the user verified out-of-band (a safety number that matches). This is
// what catches a server that substitutes a member's public key to read the chat.
// Pins are keyed by userId (one chat identity per user, shared across leagues).
export function useChatKeyVerification(
  members: MaybeRefOrGetter<{ userId: string; publicKey: string }[]>,
  myPublicKey: MaybeRefOrGetter<string | null>,
) {
  const pins = useStorage<Record<string, string>>('ng-chat-keypins', {})
  const verified = useStorage<Record<string, string>>('ng-chat-keyverified', {})
  const entries = ref<KeyEntry[]>([])
  const myFingerprint = ref('')

  async function recompute(): Promise<void> {
    const list: KeyEntry[] = []
    const nextPins = { ...pins.value }
    for (const m of toValue(members)) {
      const pinned = nextPins[m.userId]
      const changed = !!pinned && pinned !== m.publicKey
      if (!pinned) nextPins[m.userId] = m.publicKey // trust on first use
      list.push({
        userId: m.userId,
        publicKey: m.publicKey,
        fingerprint: await fingerprint(m.publicKey),
        verified: verified.value[m.userId] === m.publicKey,
        changed,
      })
    }
    pins.value = nextPins
    entries.value = list
    const mine = toValue(myPublicKey)
    myFingerprint.value = mine ? await fingerprint(mine) : ''
  }

  // Accept the member's current key as verified (matches their safety number).
  // This also clears a pending change flag for that member.
  function markVerified(userId: string): void {
    const m = toValue(members).find((x) => x.userId === userId)
    if (!m) return
    verified.value = { ...verified.value, [userId]: m.publicKey }
    pins.value = { ...pins.value, [userId]: m.publicKey }
    void recompute()
  }

  // Re-pin a changed key without verifying it (acknowledge the change).
  function acknowledgeChange(userId: string): void {
    const m = toValue(members).find((x) => x.userId === userId)
    if (!m) return
    pins.value = { ...pins.value, [userId]: m.publicKey }
    void recompute()
  }

  const changedCount = computed(() => entries.value.filter((e) => e.changed).length)
  const unverifiedCount = computed(() => entries.value.filter((e) => !e.verified).length)

  watch([() => toValue(members), () => toValue(myPublicKey)], () => void recompute(), {
    immediate: true,
    deep: true,
  })

  return { entries, myFingerprint, changedCount, unverifiedCount, markVerified, acknowledgeChange }
}
