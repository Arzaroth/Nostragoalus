import type { StorageDriver, StorageObject } from '../server/utils/storage/driver'

// An in-memory StorageDriver for tests: round-trips bytes by key. Pass it as the
// explicit driver arg to the chat/avatar services so they never reach for the
// runtime-config singleton (which needs a Nuxt runtime the unit project lacks).
export function memoryStorage(): StorageDriver & { store: Map<string, StorageObject> } {
  const store = new Map<string, StorageObject>()
  return {
    store,
    async put(key, bytes, contentType) {
      store.set(key, { bytes, contentType })
    },
    async get(key) {
      return store.get(key) ?? null
    },
    async delete(key) {
      store.delete(key)
    },
    async exists(key) {
      return store.has(key)
    },
  }
}
