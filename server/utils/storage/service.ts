import type { StorageDriver, StorageObject } from './driver'
import { StorageError } from '../errors'
import { avatarKey, chatImageKey } from './keys'

// The high-level, key-deriving operations the rest of the app calls. Storage is
// infrastructure, so these take a driver (not the db) as their first argument; the
// chat/avatar services keep db first and pass the configured driver in. The driver
// is resolved from runtimeConfig in ./index (useStorage).

export interface StoredAvatar {
  key: string
  url: string
}

// The avatar serving route; the value stored in user.image points here.
function avatarUrl(key: string): string {
  return `/api/media/${key}`
}

export async function putChatImage(driver: StorageDriver, messageId: string, idx: number, bytes: Uint8Array): Promise<string> {
  const key = chatImageKey(messageId, idx)
  await driver.put(key, bytes, 'application/octet-stream')
  return key
}

export async function getChatImage(driver: StorageDriver, key: string): Promise<Uint8Array> {
  const obj = await driver.get(key)
  if (!obj) throw new StorageError(`chat image missing in storage: ${key}`)
  return obj.bytes
}

export async function deleteChatImage(driver: StorageDriver, key: string): Promise<void> {
  await driver.delete(key)
}

export async function putAvatar(driver: StorageDriver, bytes: Uint8Array, contentType: string): Promise<StoredAvatar> {
  const key = avatarKey(bytes, contentType)
  await driver.put(key, bytes, contentType)
  return { key, url: avatarUrl(key) }
}

export async function getAvatar(driver: StorageDriver, key: string): Promise<StorageObject | null> {
  return driver.get(key)
}
