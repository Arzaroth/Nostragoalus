// Interop known-answer vectors for the E2EE chat crypto (libsodium). The
// encrypt/seal/derive side is non-deterministic (random nonces, keypairs,
// salts), so a vector cannot freeze THAT output. Instead bless runs the real
// impl once to PRODUCE ciphertext / a sealed key / a recovery blob, then freezes
// the deterministic REVERSE direction: given this ciphertext + key, you must get
// this plaintext. That is exactly the KAT a Dart libsodium reimplementation must
// satisfy for cross-stack interop - a Dart client has to decrypt what TS wrote.
//
// These vectors churn on every re-bless (fresh randomness); only re-bless when
// the crypto scheme itself changes.
import {
  encryptBytes,
  encryptMessage,
  generateGroupKey,
  generateIdentity,
  sealGroupKey,
  wrapPrivateKeyWithRecovery,
} from '../../../app/utils/e2ee'

interface RawCase {
  fn: string
  args: unknown[]
}

const b64 = (bytes: Uint8Array) => ({ $b64: Buffer.from(bytes).toString('base64') })

export async function buildCases(): Promise<RawCase[]> {
  const identity = await generateIdentity()
  const groupKey = await generateGroupKey()
  const wrapped = await sealGroupKey(groupKey, identity.publicKey)
  const packedMsg = await encryptMessage('hello 🌍 e2ee - café', groupKey)
  const rawBytes = Uint8Array.from([0, 1, 2, 250, 128, 255, 7])
  const packedBytes = await encryptBytes(rawBytes, groupKey)
  const recoveryCode = 'ABCD-EFGH-IJKL-MNOP'
  const blob = await wrapPrivateKeyWithRecovery(identity.privateKey, recoveryCode)

  // The identity, with its private key marshalled to a $b64 tag the harness
  // revives to bytes before the call.
  const identityArg = { publicKey: identity.publicKey, privateKey: b64(identity.privateKey) }

  return [
    // deterministic fingerprint (safety number) of a public key
    { fn: 'fingerprint', args: [identity.publicKey] },
    // crypto_box_seal_open: unwrap a group key sealed to me
    { fn: 'openGroupKey', args: [wrapped, identityArg] },
    // crypto_secretbox_open_easy: decrypt a text message
    { fn: 'decryptMessage', args: [packedMsg, b64(groupKey)] },
    // same, binary payload (an image attachment)
    { fn: 'decryptBytes', args: [packedBytes, b64(groupKey)] },
    // crypto_pwhash (Argon2id) + secretbox: restore the escrowed private key
    { fn: 'unwrapPrivateKeyWithRecovery', args: [blob, recoveryCode] },
  ]
}
