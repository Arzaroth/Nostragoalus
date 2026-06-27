import { describe, it, expect } from 'vitest'
import { createStorageDriver } from './factory'

describe('createStorageDriver', () => {
  it('builds an fs driver', () => {
    expect(createStorageDriver({ driver: 'fs', fsRoot: '/tmp/ng' })).toBeTruthy()
  })
  it('fs requires a root', () => {
    expect(() => createStorageDriver({ driver: 'fs' })).toThrow(/NUXT_STORAGE_FS_ROOT/)
  })
  it('builds an s3 driver (explicit region)', () => {
    expect(
      createStorageDriver({
        driver: 's3',
        s3Endpoint: 'http://x:9000',
        s3Region: 'eu-west-1',
        s3Bucket: 'b',
        s3AccessKeyId: 'k',
        s3SecretAccessKey: 's',
      }),
    ).toBeTruthy()
  })
  it('builds an s3 driver (default region)', () => {
    expect(
      createStorageDriver({ driver: 's3', s3Endpoint: 'http://x:9000', s3Bucket: 'b', s3AccessKeyId: 'k', s3SecretAccessKey: 's' }),
    ).toBeTruthy()
  })
  it('s3 rejects a missing endpoint', () => {
    expect(() => createStorageDriver({ driver: 's3', s3Bucket: 'b', s3AccessKeyId: 'k', s3SecretAccessKey: 's' })).toThrow(
      /s3 storage driver requires/,
    )
  })
  it('s3 rejects a missing secret', () => {
    expect(() => createStorageDriver({ driver: 's3', s3Endpoint: 'http://x', s3Bucket: 'b', s3AccessKeyId: 'k' })).toThrow(
      /s3 storage driver requires/,
    )
  })
  it('rejects an unknown driver', () => {
    expect(() => createStorageDriver({ driver: 'wat' })).toThrow(/unknown storage driver/)
  })
})
