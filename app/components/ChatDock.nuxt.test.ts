import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { nextTick, ref } from 'vue'
import ChatDock from './ChatDock.vue'

// The chat itself (ChatPanel -> useLeagueChat) is tested elsewhere; here we only
// assert the dock's gating and the scope-toggle wiring. ChatPanel is stubbed; we
// drive its on/off emit explicitly, which is what the dock keys visibility off.
const selectedLeagueId = ref<string | null>('L1')
const route = ref<{ name: string; path: string; params: Record<string, string> }>({
  name: 'competition-home',
  path: '/world-cup-2026',
  params: {},
})

vi.mock('../composables/useSelectedLeague', () => ({
  useSelectedLeague: () => ({ leagueId: selectedLeagueId }),
}))
mockNuxtImport('useRoute', () => () => route.value as never)

const ChatPanelStub = {
  name: 'ChatPanel',
  props: ['leagueId', 'matchId', 'flat'],
  emits: ['update:enabled'],
  template: '<div class="chat-panel-stub" />',
}

let mounted: Array<{ unmount: () => void }> = []
async function mount(enabled = true) {
  const w = await mountSuspended(ChatDock, { global: { stubs: { ChatPanel: ChatPanelStub } } })
  mounted.push(w)
  const panel = w.findComponent(ChatPanelStub)
  if (panel.exists()) {
    panel.vm.$emit('update:enabled', enabled)
    await nextTick()
  }
  return w
}
const bubble = (w: Awaited<ReturnType<typeof mount>>) => w.find('button[aria-label="Open league chat"]')

beforeEach(() => {
  selectedLeagueId.value = 'L1'
  route.value = { name: 'competition-home', path: '/world-cup-2026', params: {} }
})
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

describe('ChatDock', () => {
  it('renders nothing on the league pages (the inline panel owns it there)', async () => {
    route.value = { name: 'leagues-id', path: '/leagues/L1', params: { id: 'L1' } }
    const w = await mount()
    expect(w.find('.chat-panel-stub').exists()).toBe(false)
  })

  it('keeps the panel mounted but hides the bubble while chat is off', async () => {
    const w = await mount(false)
    // Mounted (so its socket can catch a live enable) but hidden via v-show.
    expect(w.find('.chat-panel-stub').exists()).toBe(true)
    expect(bubble(w).attributes('style')).toContain('display: none')
  })

  it('shows the bubble once chat is enabled', async () => {
    const w = await mount(true)
    expect(bubble(w).attributes('style') ?? '').not.toContain('display: none')
  })

  it('shows the Global/Match scope toggle only on a match route', async () => {
    const home = await mount(true)
    expect(home.text()).not.toContain('This match')

    route.value = { name: 'competition-matches-id', path: '/world-cup-2026/matches/M1', params: { id: 'M1' } }
    const match = await mount(true)
    expect(match.text()).toContain('This match')
    expect(match.text()).toContain('League')
  })
})
