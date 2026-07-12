import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { decryptSecret, encryptSecret, isSealed } from './envelope'

beforeAll(() => {
  delete process.env.SSO_KEK
  process.env.NUXT_SSO_KEK = randomBytes(32).toString('base64')
})

describe('envelope encryption', () => {
  it('round-trips a secret', () => {
    const sealed = encryptSecret('super-secret-client-key')
    expect(isSealed(sealed)).toBe(true)
    expect(decryptSecret(sealed)).toBe('super-secret-client-key')
  })

  it('produces unique ciphertext per call (random DEK + IV)', () => {
    const a = encryptSecret('same')
    const b = encryptSecret('same')
    expect(a.data).not.toBe(b.data)
    expect(a.dek).not.toBe(b.dek)
    expect(decryptSecret(a)).toBe('same')
    expect(decryptSecret(b)).toBe('same')
  })

  it('fails closed on tampering', () => {
    const sealed = encryptSecret('x')
    expect(() => decryptSecret({ ...sealed, data: `${sealed.data.slice(0, -5)}AAAAA` })).toThrow()
  })

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret({ v: 1, dek: 'nope', data: 'nope' })).toThrow()
  })

  it('isSealed discriminates sealed payloads', () => {
    expect(isSealed(null)).toBe(false)
    expect(isSealed('str')).toBe(false)
    expect(isSealed({ v: 2, dek: 'a', data: 'b' })).toBe(false)
    expect(isSealed(encryptSecret('y'))).toBe(true)
  })

  it('requires a valid 32-byte KEK', () => {
    const prev = process.env.NUXT_SSO_KEK
    process.env.NUXT_SSO_KEK = ''
    expect(() => encryptSecret('x')).toThrow(/not configured/)
    process.env.NUXT_SSO_KEK = Buffer.alloc(16).toString('base64')
    expect(() => encryptSecret('x')).toThrow(/32 bytes/)
    process.env.NUXT_SSO_KEK = prev
  })
})
