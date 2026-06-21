import { describe, it, expect } from 'vitest'
import { SOFASCORE_BASE_URL, SOFASCORE_UA, sofascoreFetch } from './sofascore-http'

describe('sofascore-http', () => {
  it('exposes the base URL and a browser UA', () => {
    expect(SOFASCORE_BASE_URL).toBe('https://api.sofascore.com')
    expect(SOFASCORE_UA).toMatch(/Mozilla/)
  })

  it('builds the TLS-spoofed fetch once and memoises it', () => {
    const a = sofascoreFetch()
    const b = sofascoreFetch()
    expect(typeof a).toBe('function')
    expect(a).toBe(b)
  })
})
