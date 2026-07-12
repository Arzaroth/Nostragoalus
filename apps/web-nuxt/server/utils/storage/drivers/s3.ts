import { AwsClient } from 'aws4fetch'
import type { StorageDriver } from '../driver'
import { StorageError } from '../../errors'
import { assertSafeKey } from '../keys'

export interface S3DriverOptions {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  // Injected in tests to drive a fake S3 without a live endpoint, mirroring the
  // match/odds providers' fetchImpl seam.
  fetchImpl?: typeof fetch
}

// S3-compatible driver over aws4fetch (SigV4 via Web Crypto, ~5KB, bundles into the
// node_modules-free prod output). Path-style addressing - bucket in the path - which
// MinIO, rustfs and AWS all accept and which avoids per-bucket DNS for a self-hosted
// endpoint.
export function s3Driver(options: S3DriverOptions): StorageDriver {
  const doFetch = options.fetchImpl ?? fetch
  const client = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    region: options.region,
    service: 's3',
  })
  const base = options.endpoint.replace(/\/+$/, '')

  function urlFor(key: string): string {
    return `${base}/${options.bucket}/${key}`
  }

  // Sign then fetch with the (injectable) fetch, rather than client.fetch, so tests
  // can intercept the signed request. Validate the key here too: the fs driver
  // contains traversal via pathFor, but the s3 driver only string-concats into the
  // URL, so this is its own backstop against a key escaping the bucket path.
  async function send(key: string, init: RequestInit): Promise<Response> {
    assertSafeKey(key)
    const signed = await client.sign(urlFor(key), init)
    return doFetch(signed)
  }

  return {
    async put(key, bytes, contentType) {
      // TS's BodyInit narrowed Uint8Array to Uint8Array<ArrayBuffer>; a generic-buffer
      // view is a valid body at runtime, so cast past the over-strict lib type.
      const res = await send(key, { method: 'PUT', body: bytes as unknown as BodyInit, headers: { 'content-type': contentType } })
      if (!res.ok) throw new StorageError(`s3 put ${key} failed: ${res.status}`)
    },
    async get(key) {
      const res = await send(key, { method: 'GET' })
      if (res.status === 404) return null
      if (!res.ok) throw new StorageError(`s3 get ${key} failed: ${res.status}`)
      const buf = await res.arrayBuffer()
      return { bytes: new Uint8Array(buf), contentType: res.headers.get('content-type') ?? 'application/octet-stream' }
    },
    async delete(key) {
      // 204 on success, 404 on a missing object - both fine (idempotent delete).
      const res = await send(key, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new StorageError(`s3 delete ${key} failed: ${res.status}`)
    },
    async exists(key) {
      const res = await send(key, { method: 'HEAD' })
      if (res.status === 404) return false
      if (!res.ok) throw new StorageError(`s3 exists ${key} failed: ${res.status}`)
      return true
    },
  }
}
