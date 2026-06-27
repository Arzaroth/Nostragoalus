import { fsDriver } from './drivers/fs'
import { s3Driver } from './drivers/s3'
import type { StorageDriver } from './driver'

export interface StorageSelection {
  driver: string
  fsRoot?: string
  s3Endpoint?: string
  s3Region?: string
  s3Bucket?: string
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  fetchImpl?: typeof fetch
}

// Mirrors server/utils/providers/factory.ts: a string-keyed switch that validates
// the driver's required config up front and throws on an unknown key.
export function createStorageDriver(selection: StorageSelection): StorageDriver {
  if (selection.driver === 'fs') {
    if (!selection.fsRoot) throw new Error('fs storage driver requires NUXT_STORAGE_FS_ROOT')
    return fsDriver({ root: selection.fsRoot })
  }

  if (selection.driver === 's3') {
    const { s3Endpoint, s3Bucket, s3AccessKeyId, s3SecretAccessKey } = selection
    if (!s3Endpoint || !s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
      throw new Error(
        's3 storage driver requires NUXT_STORAGE_S3_ENDPOINT, NUXT_STORAGE_S3_BUCKET, NUXT_STORAGE_S3_ACCESS_KEY_ID and NUXT_STORAGE_S3_SECRET_ACCESS_KEY',
      )
    }
    return s3Driver({
      endpoint: s3Endpoint,
      region: selection.s3Region || 'us-east-1',
      bucket: s3Bucket,
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
      fetchImpl: selection.fetchImpl,
    })
  }

  throw new Error(`unknown storage driver: ${selection.driver}`)
}
