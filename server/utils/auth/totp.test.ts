import { describe, it, expect } from 'vitest'
import { base32Decode, totpCode, verifyTotpCode } from './totp'

// RFC 6238 test secret: ASCII "12345678901234567890" in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('totp', () => {
  it('decodes base32 (incl. padding and lowercase)', () => {
    expect(base32Decode(RFC_SECRET).toString('ascii')).toBe('12345678901234567890')
    expect(base32Decode('gezdgnbv').toString('ascii')).toBe('12345')
    expect(base32Decode('GEZDGNBV======').toString('ascii')).toBe('12345')
  })

  it('matches the RFC 6238 SHA-1 vectors (last 6 digits)', () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe('287082') // vector 94287082
    expect(totpCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804') // vector 07081804
    expect(totpCode(RFC_SECRET, 1_234_567_890_000)).toBe('005924') // vector 89005924
  })

  it('accepts the raw-key encoding (what better-auth stores)', () => {
    expect(totpCode('12345678901234567890', 59_000, 'raw')).toBe('287082')
    expect(verifyTotpCode('12345678901234567890', '287082', 59_000, 1, 'raw')).toBe(true)
  })

  it('verifies within the drift window and rejects junk', () => {
    const t = 1_234_567_890_000
    const code = totpCode(RFC_SECRET, t)
    expect(verifyTotpCode(RFC_SECRET, code, t)).toBe(true)
    expect(verifyTotpCode(RFC_SECRET, code, t + 30_000)).toBe(true) // previous step accepted
    expect(verifyTotpCode(RFC_SECRET, code, t + 90_000)).toBe(false) // too far
    expect(verifyTotpCode(RFC_SECRET, '12345', t)).toBe(false) // wrong format
    expect(verifyTotpCode(RFC_SECRET, 'abcdef', t)).toBe(false)
  })
})
