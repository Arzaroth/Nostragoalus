import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ReactionBar from './ReactionBar.vue'

// Mock the auth + league sources with real refs the tests can mutate before
// mounting (the harness can't resolve the real reactive route/cookie sources).
vi.mock('../composables/useAuth', async () => {
  const { ref } = await import('vue')
  const signed = ref(true)
  return {
    useAuth: () => ({ session: ref(signed.value ? { data: { user: { id: 'u1' } } } : { data: null }) }),
    __signed: signed,
  }
})
vi.mock('../composables/useSelectedLeague', async () => {
  const { ref } = await import('vue')
  const leagueId = ref<string | null>(null)
  return { useSelectedLeague: () => ({ leagueId }), __leagueId: leagueId }
})
// Stub the socket: the initial fetch rides the immediate watch, not onOpen, so
// the bar populates without a real WebSocket.
vi.mock('../composables/useReconnectingSocket', () => ({ useReconnectingSocket: () => ({ send: () => {} }) }))

async function setSigned(v: boolean) {
  ;((await import('../composables/useAuth')) as any).__signed.value = v
}
async function setLeague(v: string | null) {
  ;((await import('../composables/useSelectedLeague')) as any).__leagueId.value = v
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(async () => {
  await setSigned(true)
  await setLeague(null)
  fetchMock = vi.fn(async (_url: string, opts: any) => {
    if (opts?.method === 'PUT') return { ok: true }
    if (opts?.query?.league) return { totals: { FIRE: 1, GOAL: 0, WOW: 0, LAUGH: 0, SAD: 0, ANGRY: 0 } }
    return { totals: { FIRE: 2, GOAL: 0, WOW: 1, LAUGH: 0, SAD: 0, ANGRY: 0 }, mine: null }
  })
  vi.stubGlobal('$fetch', fetchMock)
})

let mounted: Array<{ unmount: () => void }> = []
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
  vi.unstubAllGlobals()
})

async function mount() {
  const wrapper = await mountSuspended(ReactionBar, { props: { matchId: 'm1' } })
  mounted.push(wrapper)
  return wrapper
}

describe('ReactionBar', () => {
  it('renders the palette with global counts', async () => {
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('🔥'))
    await vi.waitFor(() => expect(wrapper.text()).toContain('2'))
    expect(wrapper.text()).toContain('😮')
    expect(wrapper.text()).toContain('1')
    expect(wrapper.findAll('button')).toHaveLength(6)
  })

  it('sets a reaction and highlights it on click', async () => {
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('🔥'))
    const fire = wrapper.findAll('button')[0]
    await fire.trigger('click')
    expect(fetchMock).toHaveBeenCalledWith('/api/reactions', expect.objectContaining({ method: 'PUT', body: { matchId: 'm1', emoji: 'FIRE' } }))
    await vi.waitFor(() => expect(wrapper.findAll('button')[0].attributes('aria-pressed')).toBe('true'))
  })

  it('clears the reaction when the active one is tapped again', async () => {
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('🔥'))
    const fire = wrapper.findAll('button')[0]
    await fire.trigger('click')
    await vi.waitFor(() => expect(wrapper.findAll('button')[0].attributes('aria-pressed')).toBe('true'))
    await wrapper.findAll('button')[0].trigger('click')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/reactions', expect.objectContaining({ body: { matchId: 'm1', emoji: null } }))
  })

  it('disables reacting when signed out', async () => {
    await setSigned(false)
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('🔥'))
    expect(wrapper.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
  })

  it('shows league counts and the global total when a league is selected', async () => {
    await setLeague('l1')
    const wrapper = await mount()
    // League scope: FIRE shows the league count (1), not the global count (2).
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/reactions/m1', expect.objectContaining({ query: { league: 'l1' } })))
    await vi.waitFor(() => expect(wrapper.text()).toContain('🌐'))
  })
})
