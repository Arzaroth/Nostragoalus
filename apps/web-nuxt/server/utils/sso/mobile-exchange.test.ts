import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { session, verification } from '../../../db/schema'
import { NotFoundError, ValidationError } from '../errors'
import {
  isFreshSsoSession,
  isOpaqueNonce,
  MOBILE_SSO_CALLBACK_PATH,
  MOBILE_SSO_MAX_CLOCK_SKEW_MS,
  MOBILE_SSO_MAX_SESSION_AGE_MS,
  MOBILE_SSO_PARK_PATH,
  mobileSsoParkCallback,
  parkMobileSsoToken,
  redeemMobileSsoCode,
} from './mobile-exchange'

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

describe('isFreshSsoSession', () => {
  // Against a real database on purpose. The age is computed in SQL because
  // session.created_at is `timestamp` WITHOUT time zone, and reading it into a
  // JS Date bends it by the Node process's offset - which silently either
  // refuses every real sign-in or accepts sessions of any age. A test that hands
  // the function a Date cannot see that; this one goes through the column.
  async function seedSession(db: TestDb, id: string, ageSeconds: number) {
    const userId = await makeUser(db, `u-${id}`)
    await db.insert(session).values({
      id,
      userId,
      token: `tok-${id}`,
      expiresAt: sql`(now() at time zone 'utc') + interval '7 days'`,
      createdAt: sql`(now() at time zone 'utc') - make_interval(secs => ${ageSeconds})`,
      updatedAt: sql`(now() at time zone 'utc')`,
    })
  }

  it('accepts the session the sign-in just created', async () => {
    const { db, client } = await createTestDb()
    await seedSession(db, 'brand-new', 0)
    expect(await isFreshSsoSession(db, 'brand-new')).toBe(true)
    await client.close()
  })

  it('refuses a session the browser was already carrying', async () => {
    const { db, client } = await createTestDb()
    await seedSession(db, 'stale', 5 * 60)
    await seedSession(db, 'ancient', 30 * 24 * 60 * 60)
    expect(await isFreshSsoSession(db, 'stale')).toBe(false)
    expect(await isFreshSsoSession(db, 'ancient')).toBe(false)
    await client.close()
  })

  it('holds right up to the edge of the window', async () => {
    const { db, client } = await createTestDb()
    await seedSession(db, 'just-inside', MOBILE_SSO_MAX_SESSION_AGE_MS / 1000 - 5)
    await seedSession(db, 'just-outside', MOBILE_SSO_MAX_SESSION_AGE_MS / 1000 + 5)
    expect(await isFreshSsoSession(db, 'just-inside')).toBe(true)
    expect(await isFreshSsoSession(db, 'just-outside')).toBe(false)
    await client.close()
  })

  it('refuses a request with no session, or one that does not exist', async () => {
    const { db, client } = await createTestDb()
    expect(await isFreshSsoSession(db, null)).toBe(false)
    expect(await isFreshSsoSession(db, undefined)).toBe(false)
    expect(await isFreshSsoSession(db, 'no-such-session')).toBe(false)
    await client.close()
  })
})

describe('mobileSsoParkCallback', () => {
  it('points better-auth at the park route, never at the app link', () => {
    const url = mobileSsoParkCallback('a'.repeat(20), 'b'.repeat(20))
    expect(url.startsWith(MOBILE_SSO_PARK_PATH)).toBe(true)
    expect(url.startsWith(MOBILE_SSO_CALLBACK_PATH)).toBe(false)
  })

  it('is relative, so no extra trusted origin is needed', () => {
    expect(mobileSsoParkCallback('s'.repeat(20), 'c'.repeat(20)).startsWith('/')).toBe(true)
  })

  it('escapes what it puts in the query', () => {
    const url = new URL(mobileSsoParkCallback('a b&c=d', 'x/y'), 'https://example.test')
    expect(url.searchParams.get('state')).toBe('a b&c=d')
    expect(url.searchParams.get('challenge')).toBe('x/y')
  })
})

describe('the routes the handoff is wired through', () => {
  // server/api is outside the coverage gate, so nothing else here would notice
  // the park route losing its age check or a path constant pointing at a file
  // that does not exist. Both have already broken this flow once each.
  const api = fileURLToPath(new URL('../../api', import.meta.url))
  const routeFor = (path: string) => join(api, `${path.replace(/^\/api/, '')}.get.ts`)

  it('every path constant resolves to a route that exists', () => {
    // Nitro maps server/api/<path>.get.ts onto /api/<path>. Pinning a constant
    // against itself proves nothing; this pins it against the filesystem.
    expect(existsSync(routeFor(MOBILE_SSO_PARK_PATH))).toBe(true)
    expect(existsSync(routeFor('/api/sso/mobile-authorize'))).toBe(true)
  })

  it('the park route still refuses a session that is not fresh', () => {
    // The gate is four lines in a route with no test of its own: deleting it
    // left the whole suite green, which is how it would come back.
    const source = readFileSync(routeFor(MOBILE_SSO_PARK_PATH), 'utf8')
    // The CALL, not the mention: an unused leftover import would satisfy a
    // looser check while the gate itself was gone.
    expect(source).toContain('await isFreshSsoSession(')
  })

  it('the authorize route still forwards the state cookie to the browser', () => {
    // Forwarding Set-Cookie is the entire fix: without it better-auth's callback
    // has no state cookie to match and every real sign-in dies. It reads like
    // boilerplate, so it is exactly the sort of line a refactor drops.
    const source = readFileSync(routeFor('/api/sso/mobile-authorize'), 'utf8')
    expect(source).toContain('getSetCookie')
    expect(source).toContain('set-cookie')
  })

  it('pins the handoff window, so widening it cannot be silent', () => {
    // Every other assertion is relative to the constant and follows it anywhere.
    expect(MOBILE_SSO_MAX_SESSION_AGE_MS).toBe(2 * 60 * 1000)
    expect(MOBILE_SSO_MAX_CLOCK_SKEW_MS).toBe(60 * 1000)
  })
})
