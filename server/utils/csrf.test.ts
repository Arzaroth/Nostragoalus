import { describe, it, expect } from 'vitest'
import { isCrossOriginMutation } from './csrf'

const HOST = 'goal.arzaroth.com'

describe('isCrossOriginMutation', () => {
  it('rejects a mutating request whose Origin host differs', () => {
    expect(isCrossOriginMutation({ method: 'POST', origin: 'https://evil.example', referer: null, host: HOST })).toBe(true)
    expect(isCrossOriginMutation({ method: 'DELETE', origin: 'https://evil.example', referer: null, host: HOST })).toBe(true)
  })

  it('allows a same-origin mutation (matching Origin host)', () => {
    expect(isCrossOriginMutation({ method: 'POST', origin: `https://${HOST}`, referer: null, host: HOST })).toBe(false)
  })

  it('falls back to Referer when Origin is absent', () => {
    expect(isCrossOriginMutation({ method: 'PUT', origin: null, referer: 'https://evil.example/x', host: HOST })).toBe(true)
    expect(isCrossOriginMutation({ method: 'PUT', origin: null, referer: `https://${HOST}/x`, host: HOST })).toBe(false)
  })

  it('does not reject when no browser origin is stated (non-browser client)', () => {
    expect(isCrossOriginMutation({ method: 'POST', origin: null, referer: null, host: HOST })).toBe(false)
    expect(isCrossOriginMutation({ method: 'POST', origin: '', referer: '', host: HOST })).toBe(false)
  })

  it('never rejects a non-mutating method', () => {
    expect(isCrossOriginMutation({ method: 'GET', origin: 'https://evil.example', referer: null, host: HOST })).toBe(false)
    expect(isCrossOriginMutation({ method: 'HEAD', origin: 'https://evil.example', referer: null, host: HOST })).toBe(false)
  })

  it('does not reject when the true host is unknown', () => {
    expect(isCrossOriginMutation({ method: 'POST', origin: 'https://evil.example', referer: null, host: null })).toBe(false)
  })

  it('treats an unparseable Origin as no stated origin', () => {
    expect(isCrossOriginMutation({ method: 'POST', origin: 'not a url', referer: null, host: HOST })).toBe(false)
  })

  it('rejects a different port as a different origin', () => {
    expect(isCrossOriginMutation({ method: 'POST', origin: 'https://goal.arzaroth.com:8443', referer: null, host: HOST })).toBe(true)
  })
})
