import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AdminOddsSection from './AdminOddsSection.vue'

const CONFIG = {
  providers: [
    { key: 'sofascore', fetchesOdds: true },
    { key: 'betexplorer', fetchesOdds: false },
  ],
  competitions: [{ id: 'c1', slug: 'wc', name: 'World Cup', oddsProvider: 'betexplorer', oddsProviderRef: 'wc-2026' }],
}

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
    if (url === '/api/admin/odds' && opts?.method === 'PUT') return CONFIG.competitions[0]
    return CONFIG
  })
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
})

async function setup(isAdmin = true) {
  wrapper = await mountSuspended(
    defineComponent({
      components: { AdminOddsSection },
      setup() {
        useQueryClient().clear()
      },
      template: `<AdminOddsSection :is-admin="${isAdmin}" />`,
    }),
  )
  return wrapper
}

describe('AdminOddsSection', () => {
  it('lists competitions and warns when the chosen provider cannot fetch odds', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('World Cup'))
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/odds')
    // betexplorer is fetchesOdds:false, so the warning icon shows for the seeded row.
    expect(w.find('.pi-exclamation-triangle').exists()).toBe(true)
  })

  it('saves a competition provider via PUT', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.find('button').exists()).toBe(true))
    await w.find('button').trigger('click')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/odds', {
        method: 'PUT',
        body: { competition: 'wc', provider: 'betexplorer', providerRef: 'wc-2026' },
      }),
    )
  })

  it('renders nothing for a non-admin', async () => {
    const w = await setup(false)
    expect(w.find('section').exists()).toBe(false)
  })
})
