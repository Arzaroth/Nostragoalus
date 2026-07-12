import { describe, it, expect } from 'vitest'
import type { CycleTLSResponse } from 'cycletls'
import { SOFASCORE_BASE_URL, SOFASCORE_UA, sofascoreFetch } from './sofascore-http'
import { withOk } from './cycle-tls'

const fakeRes = (status: number): CycleTLSResponse =>
  ({ status, headers: {}, json: async () => ({ a: 1 }), text: async () => 'body', arrayBuffer: async () => new ArrayBuffer(0), blob: async () => new Blob() }) as unknown as CycleTLSResponse

describe('sofascore-http', () => {
  it('exposes the base URL and an honest UA', () => {
    expect(SOFASCORE_BASE_URL).toBe('https://api.sofascore.com')
    expect(SOFASCORE_UA).toMatch(/curl/)
  })

  it('adds ok to a cycletls response, keeping status and body accessors', async () => {
    const ok = withOk(fakeRes(200))
    expect(ok.ok).toBe(true)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ a: 1 })
    expect(await ok.text()).toBe('body')
    expect(withOk(fakeRes(403)).ok).toBe(false)
    expect(withOk(fakeRes(404)).ok).toBe(false)
  })

  it('returns a memoised client function without starting the engine', () => {
    expect(typeof sofascoreFetch()).toBe('function')
    expect(sofascoreFetch()).toBe(sofascoreFetch())
  })
})
