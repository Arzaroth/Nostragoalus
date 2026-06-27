import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMock, initMock } = vi.hoisted(() => {
  const getMock = vi.fn()
  return { getMock, initMock: vi.fn(async () => ({ get: getMock, exit: vi.fn() })) }
})
vi.mock('cycletls', () => ({ default: initMock }))

import { cycleGet, withOk, cycleHeader, CHROME_JA3, CHROME_UA } from './cycle-tls'

beforeEach(() => {
  getMock.mockReset()
})

describe('cycleGet', () => {
  it('forwards the request through the uTLS engine', async () => {
    getMock.mockResolvedValue({ status: 200, text: async () => 'ok' })
    const r = await cycleGet('https://x.test', { ja3: 'j', userAgent: 'u', headers: { a: '1' }, disableRedirect: true })
    expect(getMock).toHaveBeenCalledWith('https://x.test', { ja3: 'j', userAgent: 'u', headers: { a: '1' }, disableRedirect: true })
    expect(r.status).toBe(200)
  })

  it('defaults headers to empty and reuses the engine', async () => {
    getMock.mockResolvedValue({ status: 204 })
    await cycleGet('https://y.test', { ja3: 'j', userAgent: 'u' })
    expect(getMock).toHaveBeenLastCalledWith('https://y.test', { ja3: 'j', userAgent: 'u', headers: {}, disableRedirect: undefined })
    // The engine is a lazy singleton: created once across both calls above.
    expect(initMock).toHaveBeenCalledTimes(1)
  })
})

describe('withOk', () => {
  it('adds ok based on the status', () => {
    expect(withOk({ status: 200 } as never).ok).toBe(true)
    expect(withOk({ status: 299 } as never).ok).toBe(true)
    expect(withOk({ status: 404 } as never).ok).toBe(false)
  })
})

describe('cycleHeader', () => {
  it('reads a header case-insensitively, flattening string-or-array values', () => {
    expect(cycleHeader({ 'Content-Type': ['text/html; charset=utf-8'] }, 'content-type')).toBe('text/html; charset=utf-8')
    expect(cycleHeader({ location: 'https://x.test' }, 'Location')).toBe('https://x.test')
    expect(cycleHeader({ a: [] }, 'a')).toBe('') // empty array -> ''
    expect(cycleHeader({}, 'x')).toBeNull()
    expect(cycleHeader(undefined, 'x')).toBeNull()
  })
})

describe('constants', () => {
  it('exposes a Chrome JA3 and matching UA', () => {
    expect(CHROME_JA3).toMatch(/^771,/)
    expect(CHROME_UA).toMatch(/Chrome/)
  })
})
