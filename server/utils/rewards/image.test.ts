import { describe, expect, it, vi } from 'vitest'
import type { StorageDriver } from '../storage/driver'
import { ValidationError } from '../errors'
import { storeRewardFromDataUrl } from './image'

function fakeDriver() {
  const put = vi.fn(async () => {})
  return { driver: { put } as unknown as StorageDriver, put }
}

const PNG = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10]).toString('base64')}`

describe('storeRewardFromDataUrl', () => {
  it('stores the bytes and returns a content-addressed reward key', async () => {
    const { driver, put } = fakeDriver()
    const key = await storeRewardFromDataUrl(driver, PNG)
    expect(key).toMatch(/^reward\/[0-9a-f]{64}\.png$/)
    expect(put).toHaveBeenCalledWith(key, expect.any(Uint8Array), 'image/png')
  })

  it('rejects a non-data URL', async () => {
    await expect(storeRewardFromDataUrl(fakeDriver().driver, 'https://x/a.png')).rejects.toThrow(ValidationError)
  })

  it('rejects a disallowed content type', async () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`
    await expect(storeRewardFromDataUrl(fakeDriver().driver, svg)).rejects.toThrow(ValidationError)
  })

  it('rejects an empty payload', async () => {
    await expect(storeRewardFromDataUrl(fakeDriver().driver, 'data:image/png;base64,=')).rejects.toThrow(ValidationError)
  })

  it('rejects an oversized image', async () => {
    const big = `data:image/png;base64,${'A'.repeat(720_000)}`
    await expect(storeRewardFromDataUrl(fakeDriver().driver, big)).rejects.toThrow(ValidationError)
  })
})
