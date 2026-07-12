import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fsDriver } from './fs'
import { StorageError } from '../../errors'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ng-storage-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const OCTET = 'application/octet-stream'

describe('fsDriver', () => {
  it('round-trips bytes and derives content type from the key', async () => {
    const d = fsDriver({ root })
    await d.put('avatar/abc.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg')
    const obj = await d.get('avatar/abc.jpg')
    expect(obj?.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(obj?.contentType).toBe('image/jpeg')
  })
  it('get returns null for a missing key', async () => {
    expect(await fsDriver({ root }).get('chat/m/0')).toBeNull()
  })
  it('overwrites atomically', async () => {
    const d = fsDriver({ root })
    await d.put('chat/m/0', new Uint8Array([1]), OCTET)
    await d.put('chat/m/0', new Uint8Array([2, 2]), OCTET)
    expect((await d.get('chat/m/0'))?.bytes).toEqual(new Uint8Array([2, 2]))
  })
  it('delete is idempotent', async () => {
    const d = fsDriver({ root })
    await d.put('chat/m/0', new Uint8Array([1]), OCTET)
    await d.delete('chat/m/0')
    await d.delete('chat/m/0')
    expect(await d.exists('chat/m/0')).toBe(false)
  })
  it('exists reflects presence', async () => {
    const d = fsDriver({ root })
    expect(await d.exists('chat/m/0')).toBe(false)
    await d.put('chat/m/0', new Uint8Array([1]), OCTET)
    expect(await d.exists('chat/m/0')).toBe(true)
  })
  it('rejects a key that escapes the root', async () => {
    await expect(fsDriver({ root }).get('../escape')).rejects.toBeInstanceOf(StorageError)
  })
  it('wraps a non-ENOENT get error', async () => {
    const d = fsDriver({ root })
    await mkdir(join(root, 'dir'))
    await expect(d.get('dir')).rejects.toBeInstanceOf(StorageError)
  })
  it('wraps a non-ENOENT delete error', async () => {
    const d = fsDriver({ root })
    await mkdir(join(root, 'dir'))
    await expect(d.delete('dir')).rejects.toBeInstanceOf(StorageError)
  })
  it('wraps a put error when the parent is not a directory', async () => {
    const d = fsDriver({ root })
    await writeFile(join(root, 'file'), 'x')
    await expect(d.put('file/child', new Uint8Array([1]), OCTET)).rejects.toBeInstanceOf(StorageError)
  })
})
