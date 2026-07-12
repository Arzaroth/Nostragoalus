import { createHmac } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export type TotpEncoding = 'base32' | 'raw'

export function totpCode(secret: string, timeMs: number, encoding: TotpEncoding = 'base32', period = 30, digits = 6): string {
  // better-auth stores the raw key string; otpauth URIs carry it base32-encoded.
  const key = encoding === 'base32' ? base32Decode(secret) : Buffer.from(secret, 'utf8')
  const counter = Math.floor(timeMs / 1000 / period)
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac('sha1', key).update(buf).digest()
  const offset = h[h.length - 1] & 0xf
  return ((h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0')
}

// The TOTP step (counter) a code matches within the +/-1 drift window, or null if
// none. Returned so the caller can persist it and reject a replay of the same
// code (a step already consumed). Prefers the step closest to now on a tie.
export function matchedTotpStep(
  secret: string,
  code: string,
  timeMs = Date.now(),
  window = 1,
  encoding: TotpEncoding = 'base32',
): number | null {
  const c = code.trim()
  if (!/^\d{6}$/.test(c)) return null
  for (let w = 0; w <= window; w++) {
    for (const off of w === 0 ? [0] : [-w, w]) {
      const t = timeMs + off * 30_000
      if (totpCode(secret, t, encoding) === c) return Math.floor(t / 1000 / 30)
    }
  }
  return null
}

// RFC 6238 verification with a +/-1 step window for clock drift. Stateless (no
// replay protection); use consumeTotpCode for the sensitive one-shot flows.
export function verifyTotpCode(secret: string, code: string, timeMs = Date.now(), window = 1, encoding: TotpEncoding = 'base32'): boolean {
  return matchedTotpStep(secret, code, timeMs, window, encoding) !== null
}
