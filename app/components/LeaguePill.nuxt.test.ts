import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import LeaguePill from './LeaguePill.vue'

const session = ref<{ data: { user: { id: string } } | null }>({ data: { user: { id: 'u1' } } })
const selected = ref<string | null>(null)
const leagues = ref([
  { id: 'l1', name: 'Bureau', visibility: 'PRIVATE', role: 'OWNER', memberCount: 2, competition: { id: 'c1', slug: 'wc', name: 'WC' } },
])

mockNuxtImport('useAuth', () => () => ({ session }))
mockNuxtImport('useSelectedLeague', () => () => ({
  leagueId: computed({ get: () => selected.value, set: (v: string | null) => (selected.value = v) }),
  league: computed(() => leagues.value.find((l) => l.id === selected.value) ?? null),
  leagues,
  isLoading: ref(false),
}))

beforeEach(() => {
  session.value = { data: { user: { id: 'u1' } } }
  selected.value = null
  vi.stubGlobal('$fetch', vi.fn(async () => ({ leagues: [] })))
})
afterEach(() => vi.unstubAllGlobals())

describe('LeaguePill', () => {
  it('shows Global when nothing is selected and the league name when one is', async () => {
    const wrapper = await mountSuspended(LeaguePill)
    expect(wrapper.text()).toContain('Everyone')
    selected.value = 'l1'
    await nextTick()
    expect(wrapper.text()).toContain('Bureau')
  })

  it('renders nothing for guests', async () => {
    session.value = { data: null }
    const wrapper = await mountSuspended(LeaguePill)
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('lists Global, the leagues and the join/create/browse actions in the popover', async () => {
    const wrapper = await mountSuspended(LeaguePill)
    await wrapper.find('button').trigger('click')
    await nextTick()
    const popover = document.body.textContent ?? ''
    expect(popover).toContain('Bureau')
    expect(popover).toContain('Join with code')
    expect(popover).toContain('Create league')
    expect(popover).toContain('Browse public leagues')
  })

  it('selecting a league writes the selection', async () => {
    const wrapper = await mountSuspended(LeaguePill)
    await wrapper.find('button').trigger('click')
    await nextTick()
    const buttons = Array.from(document.body.querySelectorAll('button'))
    const target = buttons.find((b) => b.textContent?.includes('Bureau'))
    expect(target).toBeTruthy()
    target!.click()
    await nextTick()
    expect(selected.value).toBe('l1')
  })
})
