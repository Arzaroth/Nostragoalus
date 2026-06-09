import { describe, it, expect, beforeAll } from 'vitest'
import { createTestDb, type TestDb } from '../../../tests/db'
import { account, ssoProvider, user } from '../../../db/schema'
import { isSsoManaged } from './sso-managed'

describe('isSsoManaged', () => {
  let db: TestDb

  async function seedUser(id: string, providers: string[]) {
    await db.insert(user).values({ id, name: id, email: `${id}@x.test` })
    for (const [i, p] of providers.entries()) {
      await db.insert(account).values({ id: `${id}-a${i}`, accountId: `${id}-${p}`, providerId: p, userId: id })
    }
  }

  beforeAll(async () => {
    db = (await createTestDb()).db
    await db.insert(ssoProvider).values({ id: 'sp1', issuer: 'https://idp.test', providerId: 'acme', domain: 'corp.test' })
    await seedUser('sso-only', ['acme'])
    await seedUser('local-only', ['credential'])
    await seedUser('linked', ['credential', 'acme'])
    await seedUser('orphaned', ['ghost-provider'])
    await seedUser('no-accounts', [])
  })

  it('flags a user whose only account is a live SSO provider', async () => {
    expect(await isSsoManaged(db, 'sso-only')).toBe(true)
  })

  it('never flags a user holding a credential account', async () => {
    expect(await isSsoManaged(db, 'local-only')).toBe(false)
    expect(await isSsoManaged(db, 'linked')).toBe(false)
  })

  it('releases users whose provider was deleted', async () => {
    expect(await isSsoManaged(db, 'orphaned')).toBe(false)
  })

  it('handles users without any account rows', async () => {
    expect(await isSsoManaged(db, 'no-accounts')).toBe(false)
  })
})
