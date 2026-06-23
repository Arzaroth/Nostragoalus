import _sodium from 'libsodium-wrappers-sumo'

// End-to-end encryption primitives for league chat. Everything here runs on the
// client; the server only ever sees the base64 outputs (public keys, sealed
// group keys, ciphertext, the recovery escrow blob) and can unwrap none of them.
//
// Scheme:
// - identity: an X25519 keypair per user (crypto_box). Public key is shared.
// - group key: a random secretbox key per league, sealed to each member's
//   public key with a libsodium sealed box (anonymous - the sender needs no key
//   of their own to wrap it for a newcomer).
// - messages: secretbox (XSalsa20-Poly1305) under the group key.
// - recovery: the private key wrapped under Argon2id(recovery code) so it can be
//   escrowed server-side as ciphertext and restored on another device.

let readyPromise: Promise<typeof _sodium> | null = null
async function sodium(): Promise<typeof _sodium> {
  if (!readyPromise) readyPromise = _sodium.ready.then(() => _sodium)
  return readyPromise
}

export interface Identity {
  publicKey: string // base64 (url-safe, no padding)
  privateKey: Uint8Array // raw bytes - never serialized to the server in the clear
}

function b64encode(s: typeof _sodium, bytes: Uint8Array): string {
  return s.to_base64(bytes, s.base64_variants.URLSAFE_NO_PADDING)
}
function b64decode(s: typeof _sodium, str: string): Uint8Array {
  return s.from_base64(str, s.base64_variants.URLSAFE_NO_PADDING)
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

// A fresh chat identity keypair. Caller stores privateKey on-device and uploads
// publicKey.
export async function generateIdentity(): Promise<Identity> {
  const s = await sodium()
  const kp = s.crypto_box_keypair()
  return { publicKey: b64encode(s, kp.publicKey), privateKey: kp.privateKey }
}

// A short, human-comparable fingerprint of a public key (a "safety number").
// Members read it aloud or compare it out-of-band to catch a substituted key: if
// the server swapped someone's public key, the numbers will not match. Six groups
// of five digits, derived deterministically from the key.
export async function fingerprint(publicKey: string): Promise<string> {
  const s = await sodium()
  const digest = s.crypto_generichash(30, b64decode(s, publicKey), null)
  const groups: string[] = []
  for (let i = 0; i < 6; i++) {
    let n = 0
    for (let j = 0; j < 5; j++) n = (n * 256 + digest[i * 5 + j]) % 100000
    groups.push(n.toString().padStart(5, '0'))
  }
  return groups.join(' ')
}

// A fresh random group key for a league's chat.
export async function generateGroupKey(): Promise<Uint8Array> {
  const s = await sodium()
  return s.crypto_secretbox_keygen()
}

// Seal (wrap) the group key to a member's public key. Anonymous sealed box: any
// keyholder can wrap it for a newcomer without needing their own key online.
export async function sealGroupKey(groupKey: Uint8Array, recipientPublicKey: string): Promise<string> {
  const s = await sodium()
  return b64encode(s, s.crypto_box_seal(groupKey, b64decode(s, recipientPublicKey)))
}

// Unwrap a group key sealed to me (needs my keypair).
export async function openGroupKey(wrapped: string, identity: Identity): Promise<Uint8Array> {
  const s = await sodium()
  return s.crypto_box_seal_open(b64decode(s, wrapped), b64decode(s, identity.publicKey), identity.privateKey)
}

// Encrypt a message under the group key. The random nonce is packed in front of
// the ciphertext so decrypt is self-contained.
export async function encryptMessage(plaintext: string, groupKey: Uint8Array): Promise<string> {
  const s = await sodium()
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES)
  const ct = s.crypto_secretbox_easy(s.from_string(plaintext), nonce, groupKey)
  return b64encode(s, concat(nonce, ct))
}

export async function decryptMessage(packed: string, groupKey: Uint8Array): Promise<string> {
  const s = await sodium()
  const raw = b64decode(s, packed)
  const nonce = raw.slice(0, s.crypto_secretbox_NONCEBYTES)
  const ct = raw.slice(s.crypto_secretbox_NONCEBYTES)
  return s.to_string(s.crypto_secretbox_open_easy(ct, nonce, groupKey))
}

// A generated high-entropy recovery code, grouped for readability. It is never
// chosen by the user (no weak passwords) and shown once.
export async function generateRecoveryCode(): Promise<string> {
  const s = await sodium()
  const str = b64encode(s, s.randombytes_buf(18))
  let out = ''
  for (let i = 0; i < str.length; i += 6) out += (i ? '-' : '') + str.slice(i, i + 6)
  return out
}

// Hyphens/whitespace in a typed-back code are cosmetic - strip before deriving.
function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, '')
}

async function deriveRecoveryKey(s: typeof _sodium, code: string, salt: Uint8Array): Promise<Uint8Array> {
  return s.crypto_pwhash(
    s.crypto_secretbox_KEYBYTES,
    normalizeCode(code),
    salt,
    s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    s.crypto_pwhash_ALG_ARGON2ID13,
  )
}

// Wrap the private key under the recovery code for server-side escrow. Output
// packs salt + nonce + ciphertext, so unwrap needs only the code.
export async function wrapPrivateKeyWithRecovery(privateKey: Uint8Array, code: string): Promise<string> {
  const s = await sodium()
  const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES)
  const key = await deriveRecoveryKey(s, code, salt)
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES)
  const ct = s.crypto_secretbox_easy(privateKey, nonce, key)
  return b64encode(s, concat(salt, nonce, ct))
}

export async function unwrapPrivateKeyWithRecovery(blob: string, code: string): Promise<Uint8Array> {
  const s = await sodium()
  const raw = b64decode(s, blob)
  const salt = raw.slice(0, s.crypto_pwhash_SALTBYTES)
  const nonce = raw.slice(s.crypto_pwhash_SALTBYTES, s.crypto_pwhash_SALTBYTES + s.crypto_secretbox_NONCEBYTES)
  const ct = raw.slice(s.crypto_pwhash_SALTBYTES + s.crypto_secretbox_NONCEBYTES)
  const key = await deriveRecoveryKey(s, code, salt)
  return s.crypto_secretbox_open_easy(ct, nonce, key)
}
