import { describe, it, expect } from 'vitest'
import { safeNext } from './post-auth-redirect'

describe('safeNext', () => {
  it('passes through a same-origin path', () => {
    expect(safeNext('/leagues/join/abc')).toBe('/leagues/join/abc')
    expect(safeNext('/matches?x=1#y')).toBe('/matches?x=1#y')
  })

  it('falls back for non-paths and open-redirect attempts', () => {
    expect(safeNext('//evil.com')).toBe('/matches')
    expect(safeNext('/\\evil.com')).toBe('/matches')
    expect(safeNext('https://evil.com')).toBe('/matches')
    expect(safeNext('javascript:alert(1)')).toBe('/matches')
    expect(safeNext('matches')).toBe('/matches')
    expect(safeNext('')).toBe('/matches')
    expect(safeNext(undefined)).toBe('/matches')
    expect(safeNext(42)).toBe('/matches')
  })

  it('honors a custom fallback', () => {
    expect(safeNext(null, '/home')).toBe('/home')
  })
})
