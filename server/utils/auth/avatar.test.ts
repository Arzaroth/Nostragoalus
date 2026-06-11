import { describe, it, expect } from 'vitest'
import { isUnusableAvatarUrl } from './avatar'

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
