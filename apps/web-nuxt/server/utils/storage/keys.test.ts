import { describe, it, expect } from 'vitest'
import { assertSafeKey, avatarKey, chatImageKey, contentTypeFromKey, rewardKey } from './keys'
import { StorageError } from '../errors'

describe('assertSafeKey', () => {
  it('accepts a normal key', () => {
    expect(() => assertSafeKey('avatar/abc.jpg')).not.toThrow()
  })
  it('rejects traversal', () => {
    expect(() => assertSafeKey('a/../b')).toThrow(StorageError)
  })
  it('rejects a leading slash', () => {
    expect(() => assertSafeKey('/etc/passwd')).toThrow(StorageError)
  })
  it('rejects a NUL byte', () => {
    expect(() => assertSafeKey('a\0b')).toThrow(StorageError)
  })
  it('rejects an out-of-charset character', () => {
    expect(() => assertSafeKey('a b')).toThrow(StorageError)
  })
})

describe('chatImageKey', () => {
  it('builds chat/{messageId}/{idx}', () => {
    expect(chatImageKey('11111111-1111-1111-1111-111111111111', 0)).toBe('chat/11111111-1111-1111-1111-111111111111/0')
  })
})

describe('avatarKey', () => {
  it('content-addresses by sha256 + extension', () => {
    expect(avatarKey(new Uint8Array([1, 2, 3]), 'image/jpeg')).toMatch(/^avatar\/[0-9a-f]{64}\.jpg$/)
  })
  it('is stable for identical bytes', () => {
    expect(avatarKey(new Uint8Array([9]), 'image/png')).toBe(avatarKey(new Uint8Array([9]), 'image/png'))
  })
  it('rejects an unsupported content type', () => {
    expect(() => avatarKey(new Uint8Array([1]), 'image/tiff')).toThrow(StorageError)
  })
})

describe('rewardKey', () => {
  it('content-addresses by sha256 + extension under reward/', () => {
    expect(rewardKey(new Uint8Array([1, 2, 3]), 'image/webp')).toMatch(/^reward\/[0-9a-f]{64}\.webp$/)
  })
  it('rejects an unsupported content type', () => {
    expect(() => rewardKey(new Uint8Array([1]), 'image/tiff')).toThrow(StorageError)
  })
})

describe('contentTypeFromKey', () => {
  it('maps known extensions', () => {
    expect(contentTypeFromKey('avatar/x.jpg')).toBe('image/jpeg')
    expect(contentTypeFromKey('a.jpeg')).toBe('image/jpeg')
    expect(contentTypeFromKey('a.png')).toBe('image/png')
    expect(contentTypeFromKey('a.webp')).toBe('image/webp')
    expect(contentTypeFromKey('a.gif')).toBe('image/gif')
  })
  it('falls back when there is no extension', () => {
    expect(contentTypeFromKey('chat/m/0')).toBe('application/octet-stream')
  })
  it('falls back for an unknown extension', () => {
    expect(contentTypeFromKey('a.txt')).toBe('application/octet-stream')
  })
})
