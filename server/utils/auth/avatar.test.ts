import { describe, it, expect, vi } from 'vitest'
import { fetchAvatarDataUrl, isUnusableAvatarUrl } from './avatar'

describe('isUnusableAvatarUrl', () => {
  it('flags Microsoft Graph photo URLs (need an OAuth token, 401 in a browser)', () => {
    expect(isUnusableAvatarUrl('https://graph.microsoft.com/v1.0/me/photo/$value')).toBe(true)
    expect(isUnusableAvatarUrl('graph.microsoft.com/v1.0/me/photo/$value')).toBe(true)
  })

  it('keeps uploaded data URLs and public CDN pictures', () => {
    expect(isUnusableAvatarUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(false)
    expect(isUnusableAvatarUrl('https://lh3.googleusercontent.com/a/abc')).toBe(false)
    expect(isUnusableAvatarUrl(null)).toBe(false)
    expect(isUnusableAvatarUrl(undefined)).toBe(false)
    expect(isUnusableAvatarUrl('')).toBe(false)
  })
})

const GRAPH = 'https://graph.microsoft.com/v1.0/me/photo/$value'
const imgRes = (body: Uint8Array, contentType = 'image/jpeg', ok = true) =>
  ({ ok, headers: { get: () => contentType }, arrayBuffer: async () => body.buffer }) as unknown as Response

describe('fetchAvatarDataUrl', () => {
  it('inlines the token-fetched photo as a data URL, hitting the bounded thumbnail', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://graph.microsoft.com/v1.0/me/photos/240x240/$value')
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok')
      return imgRes(new Uint8Array([1, 2, 3]), 'image/png')
    }) as unknown as typeof fetch
    expect(await fetchAvatarDataUrl(GRAPH, 'tok', fetchImpl)).toBe(`data:image/png;base64,${Buffer.from([1, 2, 3]).toString('base64')}`)
  })

  it('returns null on a non-OK response, a non-image, an empty/oversized body, or a throw', async () => {
    const notOk = (async () => imgRes(new Uint8Array([1]), 'image/jpeg', false)) as unknown as typeof fetch
    expect(await fetchAvatarDataUrl(GRAPH, 'tok', notOk)).toBeNull()
    const notImage = (async () => imgRes(new Uint8Array([1]), 'text/html')) as unknown as typeof fetch
    expect(await fetchAvatarDataUrl(GRAPH, 'tok', notImage)).toBeNull()
    const empty = (async () => imgRes(new Uint8Array([]))) as unknown as typeof fetch
    expect(await fetchAvatarDataUrl(GRAPH, 'tok', empty)).toBeNull()
    const huge = (async () => imgRes(new Uint8Array(600 * 1024))) as unknown as typeof fetch
    expect(await fetchAvatarDataUrl(GRAPH, 'tok', huge)).toBeNull()
    const throws = (async () => { throw new Error('net') }) as unknown as typeof fetch
    expect(await fetchAvatarDataUrl(GRAPH, 'tok', throws)).toBeNull()
  })
})
