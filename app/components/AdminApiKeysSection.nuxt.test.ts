import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AdminApiKeysSection from './AdminApiKeysSection.vue'

const list = vi.fn()
const create = vi.fn()
const del = vi.fn()
// Mock the whole auth-client surface the app boots with (useSession is read by
// the layout on mount), plus the apiKey methods this component drives.
vi.mock('../../lib/auth-client', async () => {
  const { ref } = await import('vue')
  const session = ref({ data: null })
  const authClient = {
    apiKey: { list: (...a: unknown[]) => list(...a), create: (...a: unknown[]) => create(...a), delete: (...a: unknown[]) => del(...a) },
    useSession: () => session,
    signIn: {},
    signUp: {},
    signOut: () => {},
  }
  return { authClient, signIn: authClient.signIn, signUp: authClient.signUp, signOut: authClient.signOut, useSession: authClient.useSession }
})

beforeEach(() => {
  list.mockResolvedValue({ data: { apiKeys: [{ id: 'k1', name: 'watch bot', start: 'ng_abcd', enabled: true, expiresAt: null, lastRequest: null, permissions: { media: ['write'] }, createdAt: '2026-06-01T00:00:00Z' }], total: 1 }, error: null })
  create.mockResolvedValue({ data: { key: 'ng_full-secret-value' }, error: null })
  del.mockResolvedValue({ error: null })
})
afterEach(() => vi.clearAllMocks())

describe('AdminApiKeysSection', () => {
  it('lists keys with their scope and masked prefix', async () => {
    const wrapper = await mountSuspended(AdminApiKeysSection, { props: { isAdmin: true } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('watch bot'))
    expect(wrapper.text()).toContain('media:write')
    expect(wrapper.text()).toContain('ng_abcd')
  })

  it('renders nothing for a non-admin', async () => {
    const wrapper = await mountSuspended(AdminApiKeysSection, { props: { isAdmin: false } })
    expect(wrapper.find('section').exists()).toBe(false)
    expect(list).not.toHaveBeenCalled()
  })

  it('creates a scoped key and shows the plaintext once', async () => {
    const wrapper = await mountSuspended(AdminApiKeysSection, { props: { isAdmin: true } })
    await vi.waitFor(() => expect(wrapper.find('form').exists()).toBe(true))

    await wrapper.find('input[type="text"]').setValue('new bot')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.text()).toContain('ng_full-secret-value'))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'new bot',
      permissions: { media: ['write'] },
      rateLimitEnabled: false,
    }))
  })

  it('revokes a key by id', async () => {
    const wrapper = await mountSuspended(AdminApiKeysSection, { props: { isAdmin: true } })
    await vi.waitFor(() => expect(wrapper.find('button[aria-label="Revoke"]').exists()).toBe(true))
    await wrapper.find('button[aria-label="Revoke"]').trigger('click')
    expect(del).toHaveBeenCalledWith({ keyId: 'k1' })
  })
})
