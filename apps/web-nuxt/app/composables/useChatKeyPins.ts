import { useStorage } from '@vueuse/core'

// One shared, persisted view of the public keys this device has pinned per user
// (trust-on-first-use). Both the verification panel and the key-distribution
// paths read the same store, so a keyholder never auto-wraps the group key to a
// key that has changed under its pin without the user accepting it first.
const PINS_KEY = 'ng-chat-keypins'
let pinsRef: ReturnType<typeof useStorage<Record<string, string>>> | null = null

export function chatKeyPins() {
  if (!pinsRef) pinsRef = useStorage<Record<string, string>>(PINS_KEY, {})
  return pinsRef
}

// A member's key is trusted to wrap the group key to when it is unseen (first
// use) or matches what we pinned. A pinned key that now differs is a change the
// user must accept (verify/acknowledge) before we hand the group key to it.
export function isKeyTrusted(pins: Record<string, string>, userId: string, publicKey: string): boolean {
  const pinned = pins[userId]
  return !pinned || pinned === publicKey
}
