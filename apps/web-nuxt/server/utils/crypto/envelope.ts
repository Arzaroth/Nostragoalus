import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Envelope encryption for provider secrets at rest:
//   - a master KEK (key-encryption key) comes from the environment,
//   - each secret gets a fresh random DEK (data-encryption key),
//   - the DEK encrypts the secret with AES-256-GCM (AEAD),
//   - the KEK wraps the DEK with AES-256-GCM.
// Only the wrapped DEK + ciphertext are stored, so the plaintext secret and the
// raw DEK never touch the database.

const ALGO = 'aes-256-gcm'

export interface SealedSecret {
  v: 1
  dek: string
  data: string
}

function kek(): Buffer {
  const raw = process.env.NUXT_SSO_KEK ?? process.env.SSO_KEK
  if (!raw) throw new Error('SSO encryption key (NUXT_SSO_KEK) is not configured')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('NUXT_SSO_KEK must decode to 32 bytes (base64-encoded AES-256 key)')
  return key
}

function seal(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, ciphertext].map((b) => b.toString('base64')).join('.')
}

function open(key: Buffer, packed: string): Buffer {
  const parts = packed.split('.')
  if (parts.length !== 3) throw new Error('malformed sealed payload')
  const [iv, tag, ciphertext] = parts.map((s) => Buffer.from(s, 'base64'))
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

export function encryptSecret(plaintext: string): SealedSecret {
  const dek = randomBytes(32)
  const data = seal(dek, Buffer.from(plaintext, 'utf8'))
  const wrappedDek = seal(kek(), dek)
  return { v: 1, dek: wrappedDek, data }
}

export function decryptSecret(sealed: SealedSecret): string {
  const dek = open(kek(), sealed.dek)
  return open(dek, sealed.data).toString('utf8')
}

export function isSealed(value: unknown): value is SealedSecret {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as SealedSecret).v === 1 &&
    typeof (value as SealedSecret).dek === 'string' &&
    typeof (value as SealedSecret).data === 'string'
  )
}
