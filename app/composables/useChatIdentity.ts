import {
  generateIdentity,
  generateRecoveryCode,
  unwrapPrivateKeyWithRecovery,
  wrapPrivateKeyWithRecovery,
  type Identity,
} from '~/utils/e2ee'

// Minimal IndexedDB key/value (client only). The private key is stored as a
// structured-cloneable Uint8Array; it never leaves the device except as the
// recovery escrow ciphertext.
const DB_NAME = 'ng-chat'
const STORE = 'identity'
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbGet<T>(key: string): Promise<T | null> {
  const d = await openIdb()
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    r.onsuccess = () => resolve((r.result as T) ?? null)
    r.onerror = () => reject(r.error)
  })
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const d = await openIdb()
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
}

type IdentityStatus = 'unknown' | 'ready' | 'needs-restore' | 'unavailable'

// Module-level: one chat identity per app session, shared by every chat panel.
const status = ref<IdentityStatus>('unknown')
const identity = ref<Identity | null>(null)
const hasRecovery = ref(false)
let initPromise: Promise<void> | null = null

export function useChatIdentity() {
  const { session } = useAuth()
  const userId = computed(() => session.value?.data?.user?.id ?? null)

  async function doInit(uid: string) {
    const local = await idbGet<Identity>(`id-${uid}`)
    const server = await $fetch<{ identity: { publicKey: string; hasRecovery: boolean } | null }>('/api/chat/identity')
    hasRecovery.value = !!server.identity?.hasRecovery
    if (server.identity) {
      if (local && local.publicKey === server.identity.publicKey) {
        identity.value = local
        status.value = 'ready'
      } else {
        // The server knows my identity but this device lacks the matching key:
        // restore from a recovery code (or another device).
        status.value = 'needs-restore'
      }
      return
    }
    // No identity yet: enroll silently (reuse a device key if one exists).
    const id = local ?? (await generateIdentity())
    await $fetch('/api/chat/identity', { method: 'PUT', body: { publicKey: id.publicKey } })
    await idbSet(`id-${uid}`, id)
    identity.value = id
    status.value = 'ready'
  }

  // Idempotent: enroll/load the identity once. Safe to call from every panel.
  async function ensure(): Promise<void> {
    if (!import.meta.client) return
    if (status.value === 'ready') return
    const uid = userId.value
    if (!uid) {
      status.value = 'unavailable'
      return
    }
    if (!initPromise) initPromise = doInit(uid).catch(() => undefined)
    await initPromise
  }

  // Generate a recovery code, escrow the private key under it, return the code to
  // show once. Caller must have a ready identity.
  async function setupRecovery(): Promise<string> {
    if (!identity.value) throw new Error('chat identity not ready')
    const code = await generateRecoveryCode()
    const blob = await wrapPrivateKeyWithRecovery(identity.value.privateKey, code)
    await $fetch('/api/chat/recovery', { method: 'PUT', body: { blob } })
    hasRecovery.value = true
    return code
  }

  // Hard recovery from a device that has no usable key AND no recovery code: mint a
  // fresh keypair and replace the server identity, becoming ready here. Server-side the
  // old escrow and every key sealed to the old identity are dropped, so a keyholder/peer
  // re-seals the current keys to this new identity once they acknowledge the changed
  // safety number. History under a rotated-out league epoch stays lost. Needs an
  // existing server identity to reset (there is nothing to reset otherwise).
  async function resetIdentity(): Promise<void> {
    const uid = userId.value
    if (!uid) throw new Error('signed out')
    const id = await generateIdentity()
    // Persist the new key locally BEFORE the server call. If the reset landed but the
    // local write were then lost (crash, storage eviction), the server would hold a
    // public key whose private key is gone and the old escrow is already dropped -
    // unrecoverable. Writing first means a mid-flight failure lands in needs-restore
    // with the old escrow still intact (the server still has the old key), which the
    // user can recover from with their old code.
    await idbSet(`id-${uid}`, id)
    await $fetch('/api/chat/identity/reset', { method: 'POST', body: { publicKey: id.publicKey } })
    identity.value = id
    status.value = 'ready'
    hasRecovery.value = false
  }

  // Restore the private key on this device from a recovery code. Throws if the
  // code is wrong or no escrow exists.
  async function restore(code: string): Promise<void> {
    const uid = userId.value
    if (!uid) throw new Error('signed out')
    const server = await $fetch<{ identity: { publicKey: string } | null }>('/api/chat/identity')
    const rec = await $fetch<{ blob: string | null }>('/api/chat/recovery')
    if (!server.identity || !rec.blob) throw new Error('no recovery escrow available')
    const privateKey = await unwrapPrivateKeyWithRecovery(rec.blob, code)
    const id: Identity = { publicKey: server.identity.publicKey, privateKey }
    await idbSet(`id-${uid}`, id)
    identity.value = id
    status.value = 'ready'
  }

  return { status, identity, hasRecovery, ensure, setupRecovery, restore, resetIdentity }
}
