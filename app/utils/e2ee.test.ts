import { describe, it, expect } from 'vitest'
import {
  decryptMessage,
  encryptMessage,
  generateGroupKey,
  generateIdentity,
  generateRecoveryCode,
  openGroupKey,
  sealGroupKey,
  unwrapPrivateKeyWithRecovery,
  wrapPrivateKeyWithRecovery,
} from './e2ee'

describe('e2ee identity + group key', () => {
  it('generates an identity with a base64 public key and 32-byte private key', async () => {
    const id = await generateIdentity()
    expect(typeof id.publicKey).toBe('string')
    expect(id.publicKey.length).toBeGreaterThan(0)
    expect(id.privateKey).toBeInstanceOf(Uint8Array)
    expect(id.privateKey.length).toBe(32)
  })

  it('seals a group key to a member and lets only that member open it', async () => {
    const groupKey = await generateGroupKey()
    expect(groupKey.length).toBe(32)
    const alice = await generateIdentity()
    const wrapped = await sealGroupKey(groupKey, alice.publicKey)
    expect(wrapped).not.toContain('=') // url-safe, no padding
    const opened = await openGroupKey(wrapped, alice)
    expect(Array.from(opened)).toEqual(Array.from(groupKey))
  })

  it('does not let a different member open a sealed group key', async () => {
    const groupKey = await generateGroupKey()
    const alice = await generateIdentity()
    const mallory = await generateIdentity()
    const wrapped = await sealGroupKey(groupKey, alice.publicKey)
    await expect(openGroupKey(wrapped, mallory)).rejects.toThrow()
  })
})

describe('e2ee messages', () => {
  it('round-trips a message through the group key', async () => {
    const groupKey = await generateGroupKey()
    const packed = await encryptMessage('come on you spurs ⚽', groupKey)
    expect(packed).not.toContain('come on')
    expect(await decryptMessage(packed, groupKey)).toBe('come on you spurs ⚽')
  })

  it('fails to decrypt under the wrong group key', async () => {
    const packed = await encryptMessage('secret', await generateGroupKey())
    await expect(decryptMessage(packed, await generateGroupKey())).rejects.toThrow()
  })
})

describe('e2ee recovery', () => {
  it('generates a grouped recovery code', async () => {
    const code = await generateRecoveryCode()
    expect(code).toContain('-')
    expect(code.replace(/-/g, '').length).toBeGreaterThan(0)
  })

  it('wraps and unwraps the private key with the recovery code', async () => {
    const id = await generateIdentity()
    const code = await generateRecoveryCode()
    const blob = await wrapPrivateKeyWithRecovery(id.privateKey, code)
    const restored = await unwrapPrivateKeyWithRecovery(blob, code)
    expect(Array.from(restored)).toEqual(Array.from(id.privateKey))
  })

  it('ignores hyphens/whitespace when the code is typed back', async () => {
    const id = await generateIdentity()
    const code = await generateRecoveryCode()
    const blob = await wrapPrivateKeyWithRecovery(id.privateKey, code)
    const messy = `  ${code.replace(/-/g, ' ')}  `
    const restored = await unwrapPrivateKeyWithRecovery(blob, messy)
    expect(Array.from(restored)).toEqual(Array.from(id.privateKey))
  })

  it('rejects a wrong recovery code', async () => {
    const id = await generateIdentity()
    const blob = await wrapPrivateKeyWithRecovery(id.privateKey, await generateRecoveryCode())
    await expect(unwrapPrivateKeyWithRecovery(blob, await generateRecoveryCode())).rejects.toThrow()
  })
})
