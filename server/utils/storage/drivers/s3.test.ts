import { describe, it, expect } from 'vitest'
import { s3Driver } from './s3'
import { StorageError } from '../../errors'

// A minimal in-memory S3, keyed by request path, behind the injected fetch - so the
// driver's signing + verb handling is exercised without a live endpoint.
function fakeS3() {
  const store = new Map<string, { bytes: Uint8Array; contentType: string }>()
  const calls: { method: string; pathname: string; auth: string | null }[] = []
  const fetchImpl: typeof fetch = async (input) => {
    const req = input as Request
    const url = new URL(req.url)
    const key = url.pathname
    calls.push({ method: req.method, pathname: key, auth: req.headers.get('authorization') })
    if (req.method === 'PUT') {
      const bytes = new Uint8Array(await req.arrayBuffer())
      store.set(key, { bytes, contentType: req.headers.get('content-type') ?? '' })
      return new Response(null, { status: 200 })
    }
    if (req.method === 'GET') {
      const o = store.get(key)
      if (!o) return new Response(null, { status: 404 })
      const headers: Record<string, string> = {}
      if (o.contentType) headers['content-type'] = o.contentType
      return new Response(o.bytes, { status: 200, headers })
    }
    if (req.method === 'HEAD') return new Response(null, { status: store.has(key) ? 200 : 404 })
    if (req.method === 'DELETE') {
      store.delete(key)
      return new Response(null, { status: 204 })
    }
    return new Response(null, { status: 400 })
  }
  return { fetchImpl, store, calls }
}

const opts = (fetchImpl: typeof fetch) => ({
  endpoint: 'http://rustfs:9000/',
  region: 'us-east-1',
  bucket: 'media',
  accessKeyId: 'k',
  secretAccessKey: 's',
  fetchImpl,
})

const status = (code: number): typeof fetch => async () => new Response(null, { status: code })

describe('s3Driver', () => {
  it('puts a signed, path-style request and reads it back', async () => {
    const f = fakeS3()
    const d = s3Driver(opts(f.fetchImpl))
    await d.put('avatar/x.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg')
    const put = f.calls.find((c) => c.method === 'PUT')!
    expect(put.pathname).toBe('/media/avatar/x.jpg')
    expect(put.auth).toMatch(/^AWS4-HMAC-SHA256 /)
    const obj = await d.get('avatar/x.jpg')
    expect(obj?.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(obj?.contentType).toBe('image/jpeg')
  })
  it('get returns null on 404', async () => {
    expect(await s3Driver(opts(fakeS3().fetchImpl)).get('avatar/missing.jpg')).toBeNull()
  })
  it('get defaults the content type when the response omits it', async () => {
    const f = fakeS3()
    const d = s3Driver(opts(f.fetchImpl))
    await d.put('chat/m/0', new Uint8Array([9]), '')
    expect((await d.get('chat/m/0'))?.contentType).toBe('application/octet-stream')
  })
  it('put throws StorageError on a non-ok status', async () => {
    await expect(s3Driver(opts(status(500))).put('a', new Uint8Array([1]), 'image/png')).rejects.toBeInstanceOf(StorageError)
  })
  it('get throws StorageError on a non-ok, non-404 status', async () => {
    await expect(s3Driver(opts(status(500))).get('a')).rejects.toBeInstanceOf(StorageError)
  })
  it('exists is true, false, or errors', async () => {
    const f = fakeS3()
    const d = s3Driver(opts(f.fetchImpl))
    await d.put('chat/m/0', new Uint8Array([1]), 'application/octet-stream')
    expect(await d.exists('chat/m/0')).toBe(true)
    expect(await d.exists('chat/none/0')).toBe(false)
    await expect(s3Driver(opts(status(500))).exists('a')).rejects.toBeInstanceOf(StorageError)
  })
  it('delete tolerates 204 and 404 but throws on 5xx', async () => {
    const f = fakeS3()
    const d = s3Driver(opts(f.fetchImpl))
    await d.put('chat/m/0', new Uint8Array([1]), 'application/octet-stream')
    await expect(d.delete('chat/m/0')).resolves.toBeUndefined()
    await expect(s3Driver(opts(status(404))).delete('a')).resolves.toBeUndefined()
    await expect(s3Driver(opts(status(500))).delete('a')).rejects.toBeInstanceOf(StorageError)
  })
})
