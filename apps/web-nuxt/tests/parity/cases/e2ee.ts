// Interop known-answer vectors for the E2EE chat crypto (libsodium). The
// encrypt/seal/derive side is non-deterministic (random nonces, keypairs,
// salts), so a vector cannot freeze THAT output. What is frozen is the
// deterministic REVERSE direction: given this ciphertext + key, you must get
// this plaintext. That is exactly the KAT a Dart libsodium reimplementation must
// satisfy for cross-stack interop - a Dart client has to decrypt what TS wrote.
//
// The inputs below are LITERAL, captured once from a real encrypt/seal run, so
// `parity:bless` is idempotent: re-blessing recomputes only `expected`, and a
// diff in this module means the crypto actually changed. To mint a new set,
// run the seal side by hand and paste the results here.

interface RawCase {
  fn: string
  args: unknown[]
}

const publicKey = 'QmAspqgfkjNUQakh6viHLsWfmuTE9t_kOtzsKw3JnHg'
const privateKey = { $b64: 'oIjvTUNfMoTncfMjrqAVED/O95SNGKzu8cYsbfGbqSI=' }
const groupKey = { $b64: 'E9FQtbqyOl7fFA2RbSY0FCeuCEGBELXqgU1Mx3kluCE=' }
// The private key above, escrowed under this recovery code.
const recoveryCode = 'ABCD-EFGH-IJKL-MNOP'
const recoveryBlob =
  'wAPhgXdhR1K8lP28lh-yPOKW5VYHrqKmoswjPptTaZwwPqvoPLb9AMu29sMqOAnjMJ4R8DPK1yUINbmeh1vYvzrWA_WSq58YsErIrA2DvO1G1_jLORJhWQ'
// The group key, sealed to the public key above.
const sealedGroupKey =
  'OtmDoPBjImUqKUHJdENDqriks2E7LjXfqvzcb_pBWxabhmagt2pjBYcc-37UrWwzZe9xSeNDYKLLOS9_vYyPFLdFtuFdxm_DbeBLmdZoy7Y'
// 'hello 🌍 e2ee - café' and Uint8Array [0,1,2,250,128,255,7], under the group key.
const packedMessage =
  'yGoEC24oeT0AYO6r7d6i240HvUOo1A3ZNzmAp1pMHV4xx2Gi050svcOFJ0kR4n74yrvM8E2r0tbgcLEpNz-q'
const packedBytes = 'n1ReCjZwp7gj5_pRA7rfSBKDMP-j3fWOGBJ-LeyeNJCpC1A3yVtPetgSyiaCMUY'

export async function buildCases(): Promise<RawCase[]> {
  return [
    // deterministic fingerprint (safety number) of a public key
    { fn: 'fingerprint', args: [publicKey] },
    // crypto_box_seal_open: unwrap a group key sealed to me
    { fn: 'openGroupKey', args: [sealedGroupKey, { publicKey, privateKey }] },
    // crypto_secretbox_open_easy: decrypt a text message
    { fn: 'decryptMessage', args: [packedMessage, groupKey] },
    // same, binary payload (an image attachment)
    { fn: 'decryptBytes', args: [packedBytes, groupKey] },
    // crypto_pwhash (Argon2id) + secretbox: restore the escrowed private key
    { fn: 'unwrapPrivateKeyWithRecovery', args: [recoveryBlob, recoveryCode] },
  ]
}
