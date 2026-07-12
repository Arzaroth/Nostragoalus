import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AdminApiKeysSection from './AdminApiKeysSection.vue'

const KEY_ROW = {
  id: 'k1',
  name: 'watch bot',
  start: 'ng_abc',
  enabled: true,
  expiresAt: null,
  lastRequest: null,
  permissions: { media: ['write'] },
  createdAt: '2026-06-01T00:00:00Z',
  ownerEmail: 'admin@example.com',
}

// The component now talks to the admin api-keys routes via $fetch (not the
// better-auth plugin directly); mock that surface.
let fetchMock: ReturnType<typeof vi.fn>

// A boot plugin/layout reads useSession on mount; stub the auth-client surface.
vi.mock('../../lib/auth-client', async () => {
  const { ref } = await import('vue')
  const session = ref({ data: null })
  const authClient = { useSession: () => session, signIn: {}, signUp: {}, signOut: () => {} }
  return { authClient, signIn: authClient.signIn, signUp: authClient.signUp, signOut: authClient.signOut, useSession: authClient.useSession }
})

let wrapper: Awaited<ReturnType<typeof mountSuspended>> | null = null

beforeEach(() => {
  document.body.innerHTML = ''
  fetchMock = vi.fn(async (url: string, opts?: { method?: string }) => {
    if (url === '/api/admin/api-keys' && opts?.method === 'POST') return { key: 'ng_full-secret-value' }
    if (url === '/api/admin/api-keys/revoke') return { revoked: true }
    return { apiKeys: [KEY_ROW] }
  })
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => {
  // Unmount and clear the shared vue-query cache so a leaked observer + the 60s
  // staleTime can't bleed into the next test (the repo's order-dependent flake).
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

async function setup(isAdmin = true) {
  wrapper = await mountSuspended(
    defineComponent({
      components: { AdminApiKeysSection },
      setup() {
        useQueryClient().clear()
      },
      template: `<AdminApiKeysSection :is-admin="${isAdmin}" />`,
    }),
  )
  return wrapper
}

describe('AdminApiKeysSection', () => {
  it('lists keys with their owner, scope and masked prefix', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('watch bot'))
    expect(w.text()).toContain('admin@example.com')
    expect(w.text()).toContain('media:write')
    expect(w.text()).toContain('ng_abc')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/api-keys')
  })

  it('renders nothing and fetches nothing for a non-admin', async () => {
    const w = await setup(false)
    expect(w.find('section').exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalledWith('/api/admin/api-keys')
  })

  it('creates a scoped key via the admin route and shows the plaintext once', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.find('form').exists()).toBe(true))

    await w.find('input[type="text"]').setValue('new bot')
    // Scopes are no longer pre-checked: the admin picks them explicitly.
    await w.find('input[aria-label="media:write"]').setValue(true)
    await w.find('form').trigger('submit')

    await vi.waitFor(() => expect(w.text()).toContain('ng_full-secret-value'))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/api-keys', {
      method: 'POST',
      body: { name: 'new bot', scopes: ['media:write'], expiresInSeconds: null },
    })
  })

  it('revokes a key by id via the admin route', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.find('button[aria-label="Revoke"]').exists()).toBe(true))
    await w.find('button[aria-label="Revoke"]').trigger('click')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/api-keys/revoke', { method: 'POST', body: { id: 'k1' } }),
    )
  })
})
