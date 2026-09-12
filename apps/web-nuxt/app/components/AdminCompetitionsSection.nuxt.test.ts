import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AdminCompetitionsSection from './AdminCompetitionsSection.vue'

const CONFIG = {
  competitions: [
    { id: 'c1', slug: 'world-cup-2026', name: 'FIFA World Cup 2026' },
    { id: 'c2', slug: 'euro-2024', name: 'UEFA Euro 2024' },
  ],
  defaultSlug: 'world-cup-2026',
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
  fetchMock = vi.fn(async (url: string, opts?: { method?: string; body?: { competition: string } }) => {
    if (url === '/api/admin/competitions/default' && opts?.method === 'PUT') {
      return { defaultSlug: opts.body!.competition }
    }
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
      components: { AdminCompetitionsSection },
      setup() {
        useQueryClient().clear()
      },
      template: `<AdminCompetitionsSection :is-admin="${isAdmin}" />`,
    }),
  )
  return wrapper
}

describe('AdminCompetitionsSection', () => {
  it('seeds the picker from the resolved default', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.text()).toContain('FIFA World Cup 2026'))
    expect(fetchMock).toHaveBeenCalledWith('/api/competitions')
    expect((w.find('select').element as HTMLSelectElement).value).toBe('world-cup-2026')
  })

  // Saving the value already stored would be a no-op write, so the button only
  // arms once the picker actually moves off the current default.
  it('saves only once the selection differs from the current default', async () => {
    const w = await setup(true)
    await vi.waitFor(() => expect(w.find('select').exists()).toBe(true))
    expect((w.find('button').element as HTMLButtonElement).disabled).toBe(true)

    await w.find('select').setValue('euro-2024')
    expect((w.find('button').element as HTMLButtonElement).disabled).toBe(false)
    await w.find('button').trigger('click')
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/competitions/default', {
        method: 'PUT',
        body: { competition: 'euro-2024' },
      }),
    )
  })

  it('surfaces a rejected slug instead of silently keeping the old default', async () => {
    fetchMock.mockImplementation(async (url: string, opts?: { method?: string }) => {
      if (url === '/api/admin/competitions/default' && opts?.method === 'PUT') {
        throw Object.assign(new Error('nope'), { data: { message: 'competition is archived' } })
      }
      return CONFIG
    })
    const w = await setup(true)
    await vi.waitFor(() => expect(w.find('select').exists()).toBe(true))
    await w.find('select').setValue('euro-2024')
    await w.find('button').trigger('click')
    await vi.waitFor(() => expect(w.text()).toContain('competition is archived'))
  })

  it('renders nothing for a non-admin', async () => {
    const w = await setup(false)
    expect(w.find('section').exists()).toBe(false)
  })
})
