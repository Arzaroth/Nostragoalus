import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { ConflictError } from '../errors'
import {
  deleteSubscription,
  deleteSubscriptionByEndpoint,
  listSubscriptions,
  saveSubscription,
  type PushSubscriptionInput,
} from './service'

function sub(endpoint = 'https://push.example/abc', p256dh = 'key1', auth = 'auth1'): PushSubscriptionInput {
  return { endpoint, keys: { p256dh, auth } }
}

async function setup() {
  const ctx = await createTestDb()
  const u1 = await makeUser(ctx.db, 'u1')
  const u2 = await makeUser(ctx.db, 'u2')
  return { ...ctx, u1, u2 }
}

describe('saveSubscription', () => {
  it('inserts, then upserts on the endpoint for the same owner (keys refreshed, no duplicate)', async () => {
    const { db, client, u1 } = await setup()
    await saveSubscription(db, u1, sub(), 'Firefox')
    const first = await listSubscriptions(db, u1)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ endpoint: 'https://push.example/abc', p256dh: 'key1', auth: 'auth1' })

    await saveSubscription(db, u1, sub('https://push.example/abc', 'key2', 'auth2'))
    const refreshed = await listSubscriptions(db, u1)
    expect(refreshed).toHaveLength(1)
    expect(refreshed[0]).toMatchObject({ p256dh: 'key2', auth: 'auth2' })
    await client.close()
  })

  it('refuses to reassign an endpoint owned by another account (hijack guard)', async () => {
    const { db, client, u1, u2 } = await setup()
    await saveSubscription(db, u1, sub('https://push.example/abc', 'key1', 'auth1'), 'Firefox')

    await expect(saveSubscription(db, u2, sub('https://push.example/abc', 'key2', 'auth2'))).rejects.toBeInstanceOf(
      ConflictError,
    )

    // The original owner's row is untouched - not silenced, keys not redirected.
    const owner = await listSubscriptions(db, u1)
    expect(owner).toHaveLength(1)
    expect(owner[0]).toMatchObject({ p256dh: 'key1', auth: 'auth1' })
    expect(await listSubscriptions(db, u2)).toHaveLength(0)
    await client.close()
  })
})

describe('deleteSubscription / deleteSubscriptionByEndpoint', () => {
  it('owner-scoped delete ignores another user endpoint', async () => {
    const { db, client, u1, u2 } = await setup()
    await saveSubscription(db, u1, sub('e1'))
    await saveSubscription(db, u2, sub('e2'))
    expect(await deleteSubscription(db, u1, 'e2')).toBe(0)
    expect(await deleteSubscription(db, u1, 'e1')).toBe(1)
    expect(await listSubscriptions(db, u1)).toHaveLength(0)
    expect(await listSubscriptions(db, u2)).toHaveLength(1)
    await client.close()
  })

  it('byEndpoint prunes regardless of owner', async () => {
    const { db, client, u2 } = await setup()
    await saveSubscription(db, u2, sub('e2'))
    await deleteSubscriptionByEndpoint(db, 'e2')
    expect(await listSubscriptions(db, u2)).toHaveLength(0)
    await client.close()
  })
})
