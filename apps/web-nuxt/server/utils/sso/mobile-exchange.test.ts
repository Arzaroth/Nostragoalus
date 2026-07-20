import { createHash, randomBytes } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { verification } from '../../../db/schema'
import { NotFoundError, ValidationError } from '../errors'
import { isOpaqueNonce, MOBILE_SSO_CALLBACK_PATH, parkMobileSsoToken, redeemMobileSsoCode } from './mobile-exchange'

const nonce = () => randomBytes(32).toString('base64url')
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

// Each test gets its own limiter key so the module-level budget never leaks
// across tests (and so the rate-limit test can spend a whole budget alone).
let keys = 0
const clientKey = () => `test-${++keys}`

describe('mobile SSO exchange', () => {
  it('hands the parked bearer to the client that started the flow, exactly once', async () => {
    const { db, client } = await createTestDb()
    const state = nonce()
    const verifier = nonce()
    const code = await parkMobileSsoToken(db, { state, challenge: challengeOf(verifier), token: 'bearer-abc' })

    expect(await redeemMobileSsoCode(db, { code, state, verifier, clientKey: clientKey() })).toBe('bearer-abc')
    // Replay: the row is consumed, so the second attempt cannot succeed.
    await expect(redeemMobileSsoCode(db, { code, state, verifier, clientKey: clientKey() })).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await client.close()
  })

  it('stores only the code digest, never the code itself', async () => {
    const { db, client } = await createTestDb()
    const state = nonce()
    const verifier = nonce()
    const code = await parkMobileSsoToken(db, { state, challenge: challengeOf(verifier), token: 't' })
    const rows = await db.select({ identifier: verification.identifier }).from(verification)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.identifier).not.toContain(code)
    await client.close()
  })

  it('rejects an expired code', async () => {
    const { db, client } = await createTestDb()
    const state = nonce()
    const verifier = nonce()
    const code = await parkMobileSsoToken(db, { state, challenge: challengeOf(verifier), token: 't' })
    await db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) })
    await expect(redeemMobileSsoCode(db, { code, state, verifier, clientKey: clientKey() })).rejects.toBeInstanceOf(
      NotFoundError,
    )
    // Expired or not, the row is gone: an expired code is still spent.
    expect(await db.select().from(verification)).toHaveLength(0)
    await client.close()
  })

  it('rejects a code presented with the wrong state', async () => {
    const { db, client } = await createTestDb()
    const verifier = nonce()
    const code = await parkMobileSsoToken(db, { state: nonce(), challenge: challengeOf(verifier), token: 't' })
    await expect(
      redeemMobileSsoCode(db, { code, state: nonce(), verifier, clientKey: clientKey() }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('rejects a code presented with the wrong verifier - seeing the redirect is not enough', async () => {
    const { db, client } = await createTestDb()
    const state = nonce()
    const code = await parkMobileSsoToken(db, { state, challenge: challengeOf(nonce()), token: 't' })
    await expect(
      redeemMobileSsoCode(db, { code, state, verifier: nonce(), clientKey: clientKey() }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('rejects an unknown code', async () => {
    const { db, client } = await createTestDb()
    await expect(
      redeemMobileSsoCode(db, { code: nonce(), state: nonce(), verifier: nonce(), clientKey: clientKey() }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('rejects malformed input on both sides instead of storing it', async () => {
    const { db, client } = await createTestDb()
    const good = nonce()
    await expect(parkMobileSsoToken(db, { state: 'short', challenge: good, token: 't' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(parkMobileSsoToken(db, { state: good, challenge: 'a b c', token: 't' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    // No session cookie on the callback: nothing to hand off.
    await expect(parkMobileSsoToken(db, { state: good, challenge: good, token: '' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(await db.select().from(verification).where(eq(verification.identifier, ''))).toHaveLength(0)
    await expect(
      redeemMobileSsoCode(db, { code: '<script>', state: good, verifier: good, clientKey: clientKey() }),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('rate-limits the exchange', async () => {
    const { db, client } = await createTestDb()
    const key = clientKey()
    for (let i = 0; i < 10; i++) {
      await expect(
        redeemMobileSsoCode(db, { code: nonce(), state: nonce(), verifier: nonce(), clientKey: key }),
      ).rejects.toBeInstanceOf(NotFoundError)
    }
    await expect(
      redeemMobileSsoCode(db, { code: nonce(), state: nonce(), verifier: nonce(), clientKey: key }),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('pins nonces to base64url', () => {
    expect(isOpaqueNonce(nonce())).toBe(true)
    expect(isOpaqueNonce('too-short')).toBe(false)
    expect(isOpaqueNonce('has spaces and is long enough')).toBe(false)
    expect(isOpaqueNonce(undefined)).toBe(false)
    expect(MOBILE_SSO_CALLBACK_PATH.startsWith('/')).toBe(true)
  })
})
