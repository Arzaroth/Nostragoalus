import { describe, it, expect } from 'vitest'
import type { StorageDriver, StorageObject } from './driver'
import { StorageError } from '../errors'
import { deleteChatImage, getAvatar, getChatImage, putAvatar, putChatImage } from './service'

function fakeDriver(): StorageDriver & { store: Map<string, StorageObject> } {
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

describe('chat image storage', () => {
  it('put returns the derived key and stores the bytes', async () => {
    const d = fakeDriver()
    const key = await putChatImage(d, 'm1', 0, new Uint8Array([1, 2]))
    expect(key).toBe('chat/m1/0')
    expect(d.store.get('chat/m1/0')?.bytes).toEqual(new Uint8Array([1, 2]))
  })
  it('get returns the bytes', async () => {
    const d = fakeDriver()
    await putChatImage(d, 'm1', 1, new Uint8Array([5]))
    expect(await getChatImage(d, 'chat/m1/1')).toEqual(new Uint8Array([5]))
  })
  it('get throws when the object is missing', async () => {
    await expect(getChatImage(fakeDriver(), 'chat/none/0')).rejects.toBeInstanceOf(StorageError)
  })
  it('delete removes it', async () => {
    const d = fakeDriver()
    await putChatImage(d, 'm1', 0, new Uint8Array([1]))
    await deleteChatImage(d, 'chat/m1/0')
    expect(d.store.has('chat/m1/0')).toBe(false)
  })
})

describe('avatar storage', () => {
  it('put content-addresses and returns a serving url', async () => {
    const d = fakeDriver()
    const { key, url } = await putAvatar(d, new Uint8Array([1, 2, 3]), 'image/jpeg')
    expect(key).toMatch(/^avatar\/[0-9a-f]{64}\.jpg$/)
    expect(url).toBe(`/api/media/${key}`)
    expect(d.store.get(key)?.contentType).toBe('image/jpeg')
  })
  it('get returns the stored object or null', async () => {
    const d = fakeDriver()
    const { key } = await putAvatar(d, new Uint8Array([7]), 'image/png')
    expect((await getAvatar(d, key))?.contentType).toBe('image/png')
    expect(await getAvatar(d, 'avatar/missing.png')).toBeNull()
  })
})
