import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import ChatDock from './ChatDock.vue'

// The chat itself (ChatPanel -> useLeagueChat) is tested elsewhere; here we only
// assert the dock's gating and the scope-toggle wiring. Stub ChatPanel and drive
// the league/route/status via mocked composables.
const selectedLeagueId = ref<string | null>('L1')
const enabled = ref(true)
const route = ref<{ name: string; path: string; params: Record<string, string> }>({
  name: 'competition-home',
  path: '/world-cup-2026',
  params: {},
})

vi.mock('../composables/useSelectedLeague', () => ({
  useSelectedLeague: () => ({ leagueId: selectedLeagueId }),
}))
vi.mock('../composables/useLeagueChatStatus', () => ({
  useLeagueChatStatus: () => ({ enabled, isMember: ref(true), isLoading: ref(false) }),
}))
mockNuxtImport('useRoute', () => () => route.value as never)

let mounted: Array<{ unmount: () => void }> = []
function mount() {
  return mountSuspended(ChatDock, {
    global: { stubs: { ChatPanel: { template: '<div class="chat-panel-stub" />', props: ['leagueId', 'matchId', 'flat'] } } },
  }).then((w) => {
    mounted.push(w)
    return w
  })
}
const bubble = (w: Awaited<ReturnType<typeof mount>>) => w.find('button[aria-label="Open league chat"]')

beforeEach(() => {
  selectedLeagueId.value = 'L1'
  enabled.value = true
  route.value = { name: 'competition-home', path: '/world-cup-2026', params: {} }
})
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

describe('ChatDock', () => {
  it('hides entirely when chat is disabled', async () => {
    enabled.value = false
    const w = await mount()
    expect(bubble(w).exists()).toBe(false)
    expect(w.find('.chat-panel-stub').exists()).toBe(false)
  })

  it('hides on the league pages (the inline panel owns it there)', async () => {
    route.value = { name: 'leagues-id', path: '/leagues/L1', params: { id: 'L1' } }
    const w = await mount()
    expect(bubble(w).exists()).toBe(false)
  })

  it('renders the bubble and keeps the panel mounted when enabled', async () => {
    const w = await mount()
    expect(bubble(w).exists()).toBe(true)
    // Mounted while collapsed (v-show) so the keyholder socket stays open.
    expect(w.find('.chat-panel-stub').exists()).toBe(true)
  })

  it('shows the Global/Match scope toggle only on a match route', async () => {
    const home = await mount()
    expect(home.text()).not.toContain('This match')

    route.value = { name: 'competition-matches-id', path: '/world-cup-2026/matches/M1', params: { id: 'M1' } }
    const match = await mount()
    expect(match.text()).toContain('This match')
    expect(match.text()).toContain('League')
  })
})
