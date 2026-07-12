import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { withEncryptedSSO } from './encrypted-adapter'
import { isSealed } from './envelope'

beforeAll(() => {
  delete process.env.SSO_KEK
  process.env.NUXT_SSO_KEK = randomBytes(32).toString('base64')
})

function fakeFactory() {
  const store: Record<string, unknown>[] = []
  return () => ({
    id: 'fake',
    store,
    async create({ data }: { data: Record<string, unknown> }) {
      store.push(data)
      return data
    },
    async update({ update }: { update?: Record<string, unknown> }) {
      return update
    },
    async updateMany({ update }: { update?: Record<string, unknown> }) {
      return update
    },
    async findOne() {
      return store[store.length - 1] ?? null
    },
    async findMany() {
      return store.slice()
    },
  })
}

describe('withEncryptedSSO', () => {
  it('encrypts ssoProvider config at rest and decrypts on read', async () => {
    const adapter = withEncryptedSSO(fakeFactory())({}) as any
    const plaintext = '{"clientSecret":"shh-secret"}'
    const created = await adapter.create({
      model: 'ssoProvider',
      data: { providerId: 'p', oidcConfig: plaintext, samlConfig: '{"k":"v"}', domain: 'x.com' },
    })
    expect(created.oidcConfig).toBe(plaintext)
    expect(created.providerId).toBe('p')

    const atRest = adapter.store[0]
    expect(atRest.oidcConfig).not.toContain('shh-secret')
    expect(isSealed(JSON.parse(atRest.oidcConfig))).toBe(true)
    expect(isSealed(JSON.parse(atRest.samlConfig))).toBe(true)

    expect((await adapter.findOne({ model: 'ssoProvider' })).oidcConfig).toBe(plaintext)
    expect((await adapter.findMany({ model: 'ssoProvider' }))[0].oidcConfig).toBe(plaintext)
  })

  it('encrypts on update and update-without-changes is a no-op', async () => {
    const adapter = withEncryptedSSO(fakeFactory())({}) as any
    const updated = await adapter.update({ model: 'ssoProvider', where: [], update: { oidcConfig: '{"clientSecret":"new"}' } })
    expect(updated.oidcConfig).toBe('{"clientSecret":"new"}')
    await adapter.update({ model: 'ssoProvider', where: [] }) // no `update` key
    await adapter.updateMany({ model: 'ssoProvider', where: [], update: { samlConfig: '{"k":1}' } })
  })

  it('passes other models through untouched', async () => {
    const adapter = withEncryptedSSO(fakeFactory())({}) as any
    const u = await adapter.create({ model: 'user', data: { email: 'a@b.c', oidcConfig: 'not-encrypted' } })
    expect(u.oidcConfig).toBe('not-encrypted')
    expect((await adapter.findOne({ model: 'user' })).email).toBe('a@b.c')
    expect((await adapter.findMany({ model: 'user' }))[0].email).toBe('a@b.c')
    await adapter.update({ model: 'user', where: [], update: { name: 'x' } })
    await adapter.updateMany({ model: 'user', where: [], update: { name: 'y' } })
  })

  it('leaves legacy plaintext / non-JSON config as-is on read', async () => {
    const factory = fakeFactory()
    const adapter = withEncryptedSSO(factory)({}) as any
    adapter.store.push({ oidcConfig: '{"clientId":"plain"}', samlConfig: 'not-json' })
    const found = await adapter.findOne({ model: 'ssoProvider' })
    expect(found.oidcConfig).toBe('{"clientId":"plain"}')
    expect(found.samlConfig).toBe('not-json')
  })
})
