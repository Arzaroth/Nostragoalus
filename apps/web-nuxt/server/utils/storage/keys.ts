import { createHash } from 'node:crypto'
import { StorageError } from '../errors'

// Image content types we accept, and their canonical extension. Used both to pick
// an avatar key suffix on write and to recover a content type from a key on read
// (the fs driver has no metadata of its own).
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

// Keys are built only from UUIDs/hashes/indices, never raw user input, but this is
// the single chokepoint every key passes through before a driver sees it: a strict
// charset (no leading slash/dot), and explicit rejection of traversal and NUL.
const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.includes('\0')) {
    throw new StorageError(`unsafe storage key: ${JSON.stringify(key)}`)
  }
}

// One encrypted chat image, addressed by its message + display index (both immutable
// once the row exists). No extension: the bytes are opaque ciphertext, never served
// with a content type.
export function chatImageKey(messageId: string, idx: number): string {
  const key = `chat/${messageId}/${idx}`
  assertSafeKey(key)
  return key
}

// Avatars are content-addressed: the key is the sha256 of the bytes, so a changed
// picture gets a new immutable URL (free caching + dedup) and identical uploads
// collapse to one object.
export function avatarKey(bytes: Uint8Array, contentType: string): string {
  const ext = EXT_BY_MIME[contentType]
  if (!ext) throw new StorageError(`unsupported avatar content type: ${contentType}`)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const key = `avatar/${hash}.${ext}`
  assertSafeKey(key)
  return key
}

// Reward images are content-addressed like avatars: the key is the sha256 of the
// bytes, so an unchanged image dedups to one object and its URL is immutable.
export function rewardKey(bytes: Uint8Array, contentType: string): string {
  const ext = EXT_BY_MIME[contentType]
  if (!ext) throw new StorageError(`unsupported reward content type: ${contentType}`)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const key = `reward/${hash}.${ext}`
  assertSafeKey(key)
  return key
}

// Best-effort content type from a key's extension, for backends that don't store it.
export function contentTypeFromKey(key: string): string {
  const dot = key.lastIndexOf('.')
  const ext = dot === -1 ? '' : key.slice(dot + 1).toLowerCase()
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}
