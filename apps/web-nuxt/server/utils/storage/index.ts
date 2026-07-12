import { createStorageDriver } from './factory'
import type { StorageDriver } from './driver'

// Runtime entrypoint: resolve the configured driver once and cache it. Kept in its
// own file (and out of the coverage gate, like providers/index.ts) because it reads
// useRuntimeConfig; the testable logic lives in factory/service/keys/drivers.

let cached: StorageDriver | null = null

function defaultFsRoot(): string {
  // The container mounts the media volume at /data/storage; a bare local dev run
  // (no container, fs driver) writes under the gitignored ./.data/storage.
  return process.env.NODE_ENV === 'production' ? '/data/storage' : './.data/storage'
}

// Named useStorageDriver (not useStorage) to avoid colliding with Nitro's own
// auto-imported useStorage() KV helper.
// Resolve a driver for a service call: an explicitly-injected one (tests) or the
// configured singleton. Lives here (excluded from the coverage gate) so the
// services that call it stay free of an untestable useRuntimeConfig branch.
export function resolveStorage(driver?: StorageDriver): StorageDriver {
  return driver ?? useStorageDriver()
}

export function useStorageDriver(): StorageDriver {
  if (cached) return cached
  const config = useRuntimeConfig()
  cached = createStorageDriver({
    driver: config.storageDriver || 'fs',
    fsRoot: config.storageFsRoot || defaultFsRoot(),
    s3Endpoint: config.storageS3Endpoint,
    s3Region: config.storageS3Region,
    s3Bucket: config.storageS3Bucket,
    s3AccessKeyId: config.storageS3AccessKeyId,
    s3SecretAccessKey: config.storageS3SecretAccessKey,
  })
  return cached
}

export * from './service'
