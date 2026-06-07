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

// RFC 6238 verification with a +/-1 step window for clock drift.
export function verifyTotpCode(secret: string, code: string, timeMs = Date.now(), window = 1, encoding: TotpEncoding = 'base32'): boolean {
  const c = code.trim()
  if (!/^\d{6}$/.test(c)) return false
  for (let w = -window; w <= window; w++) {
    if (totpCode(secret, timeMs + w * 30_000, encoding) === c) return true
  }
  return false
}
