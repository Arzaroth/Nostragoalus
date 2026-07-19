import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import { computed, nextTick, ref } from 'vue'
import ChatDock from './ChatDock.vue'

// The chat itself (ChatPanel -> useLeagueChat) is tested elsewhere; here we only
// assert the dock's gating and the scope-toggle wiring. ChatPanel is stubbed; we
// drive its on/off emit explicitly, which is what the dock keys visibility off.
const selectedLeagueId = ref<string | null>('L1')
const leagueSelections = ref<Record<string, string>>({})
const route = ref<{ name: string; path: string; params: Record<string, string>; query: Record<string, string> }>({
  name: 'competition-home',
  path: '/world-cup-2026',
  params: {},
  query: {},
})

const myLeagues = ref<Array<{ id: string; name: string; chatEnabled: boolean }> | undefined>([
  { id: 'L1', name: 'Alpha', chatEnabled: true },
  { id: 'L2', name: 'Beta', chatEnabled: true },
])
const leaguesFetching = ref(false)
vi.mock('../composables/useSelectedLeague', () => ({
  useSelectedLeague: () => ({ leagueId: selectedLeagueId }),
  useLeagueSelections: () => leagueSelections,
}))
// The dock takes the whole my-leagues query (not just its data) so it can hold
// the pin prune until the list has settled.
mockNuxtImport('useMyLeagues', () => () => ({
  data: myLeagues,
  isSuccess: computed(() => myLeagues.value !== undefined),
  isFetching: leaguesFetching,
}))
mockNuxtImport('useRoute', () => () => route.value as never)

// The dock now hosts DMs too (available to any signed-in user); stub the auth +
// DM-inbox surface so the league-mode wiring under test renders.
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({ session: ref({ data: { user: { id: 'me', name: 'Me', image: null } } }) }),
}))
vi.mock('../composables/useDmInbox', () => ({
  useDmInbox: () => ({
    threads: { data: ref([]) },
    totalUnread: ref(0),
    identityStatus: ref('ready'),
    ensureIdentity: async () => {},
    searchRecipients: async () => [],
    startThread: { mutateAsync: async () => 'T1' },
    markRead: { mutate: () => {} },
  }),
}))
vi.mock('../composables/useDmOpen', () => ({
  useDmOpen: () => ({ pending: ref(null), requestOpen: ref(0), requestDm: () => {}, take: () => null }),
}))

// The multiview focus channel: drives the dock's match thread off the route.
const focusedMatchId = ref<string | null>(null)
const presentCells = ref<string[]>([])
mockNuxtImport('useMultiviewFocus', () => () => ({
  focusedMatchId,
  presentCells,
  setFocus: (v: string | null) => (focusedMatchId.value = v),
  setPresent: (v: string[]) => (presentCells.value = v),
  tryFocus: (id: string) => {
    if (presentCells.value.includes(id)) {
      focusedMatchId.value = id
      return true
    }
    return false
  },
}))

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

// A pin as it sits on disk, before the dock mounts and reads it.
function seedPin(over: Partial<{ userId: string; competition: string; leagueId: string; matchId: string | null }>) {
  localStorage.setItem(
    'ng-chat-pin',
    JSON.stringify({ userId: 'me', competition: 'world-cup-2026', leagueId: 'L1', matchId: null, ...over }),
  )
}

beforeEach(() => {
  localStorage.removeItem('ng-chat-pin')
  leaguesFetching.value = false
  myLeagues.value = [
    { id: 'L1', name: 'Alpha', chatEnabled: true },
    { id: 'L2', name: 'Beta', chatEnabled: true },
  ]
  selectedLeagueId.value = 'L1'
  leagueSelections.value = {}
  route.value = { name: 'competition-home', path: '/world-cup-2026', params: {}, query: {} }
  focusedMatchId.value = null
  presentCells.value = []
})
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

describe('ChatDock', () => {
  it('renders nothing on the league pages (the inline panel owns it there)', async () => {
    route.value = { name: 'leagues-id', path: '/leagues/L1', params: { id: 'L1' }, query: {} }
    const w = await mount()
    expect(w.find('.chat-panel-stub').exists()).toBe(false)
  })

  it('keeps the league panel mounted even while league chat is off', async () => {
    const w = await mount(false)
    // Mounted (so its socket can catch a live enable) but hidden via v-show.
    expect(w.find('.chat-panel-stub').exists()).toBe(true)
  })

  it('shows the messaging bubble for any signed-in user (DMs are always available)', async () => {
    // Even with league chat off, the bubble is shown - it also opens DMs.
    const off = await mount(false)
    expect(bubble(off).attributes('style') ?? '').not.toContain('display: none')
    const on = await mount(true)
    expect(bubble(on).attributes('style') ?? '').not.toContain('display: none')
  })

  it('shows the Global/Match scope toggle only on a match route', async () => {
    const home = await mount(true)
    expect(home.text()).not.toContain('This match')

    route.value = { name: 'competition-matches-id', path: '/world-cup-2026/matches/M1', params: { id: 'M1' }, query: {} }
    const match = await mount(true)
    expect(match.text()).toContain('This match')
    expect(match.text()).toContain('League')
  })

  it('follows a focused multiview cell even off a match route', async () => {
    // Home route (no match in the URL), but a multiview cell is focused.
    focusedMatchId.value = 'M2'
    const w = await mount(true)
    expect(w.text()).toContain('This match')
  })

  it('pinning holds the league while the rankings filter moves on', async () => {
    const w = await mount(true)
    await w.find('[data-testid="chat-pin"]').trigger('click')
    selectedLeagueId.value = 'L2'
    await nextTick()
    expect(w.findComponent(ChatPanelStub).props('leagueId')).toBe('L1')
  })

  it('unpinning hands the dock back to the rankings filter', async () => {
    const w = await mount(true)
    const btn = w.find('[data-testid="chat-pin"]')
    await btn.trigger('click')
    selectedLeagueId.value = 'L2'
    await nextTick()
    await btn.trigger('click')
    await nextTick()
    expect(w.findComponent(ChatPanelStub).props('leagueId')).toBe('L2')
  })

  it('a pinned global room ignores a multiview cell taking focus', async () => {
    const w = await mount(true)
    await w.find('[data-testid="chat-pin"]').trigger('click')
    focusedMatchId.value = 'M2'
    await nextTick()
    expect(w.findComponent(ChatPanelStub).props('matchId')).toBe(null)
  })

  it('keeps the Match tab reachable for a pinned thread off any match route', async () => {
    seedPin({ matchId: 'M9' })
    const w = await mount(true)
    expect(w.text()).toContain('This match')
    expect(w.findComponent(ChatPanelStub).props('matchId')).toBe('M9')
  })

  it('offers no Match tab for a pin held on another competition', async () => {
    // Its league and this page's match are not a room that exists.
    seedPin({ competition: 'euro-2024' })
    route.value = { name: 'competition-matches-id', path: '/world-cup-2026/matches/M1', params: { id: 'M1' }, query: {} }
    const w = await mount(true)
    expect(w.text()).not.toContain('This match')
  })

  it('self-heals from a pin it cannot read', async () => {
    localStorage.setItem('ng-chat-pin', JSON.stringify({ leagueId: 'L1' }))
    const w = await mount(true)
    expect(w.findComponent(ChatPanelStub).props('leagueId')).toBe('L1')
    // Back on the page's league, and the unpin control is reachable again.
    selectedLeagueId.value = 'L2'
    await nextTick()
    expect(w.findComponent(ChatPanelStub).props('leagueId')).toBe('L2')
    expect(w.find('[data-testid="chat-pin"]').exists()).toBe(true)
  })

  it('does not inherit the pin of whoever used the device last', async () => {
    seedPin({ userId: 'someone-else' })
    selectedLeagueId.value = 'L2'
    const w = await mount(true)
    expect(w.findComponent(ChatPanelStub).props('leagueId')).toBe('L2')
  })

  it('holds the pin while the leagues list is still being revalidated', async () => {
    seedPin({})
    leaguesFetching.value = true
    myLeagues.value = [{ id: 'L2', name: 'Beta', chatEnabled: true }]
    const w = await mount(true)
    expect(w.findComponent(ChatPanelStub).props('leagueId')).toBe('L1')
  })

  it('drops the pin once the pinned league turns its chat off', async () => {
    const w = await mount(true)
    await w.find('[data-testid="chat-pin"]').trigger('click')
    myLeagues.value = [
      { id: 'L1', name: 'Alpha', chatEnabled: false },
      { id: 'L2', name: 'Beta', chatEnabled: true },
    ]
    selectedLeagueId.value = 'L2'
    await nextTick()
    expect(w.findComponent(ChatPanelStub).props('leagueId')).toBe('L2')
  })

  it('drops the pin once the pinned league is no longer joined', async () => {
    const w = await mount(true)
    await w.find('[data-testid="chat-pin"]').trigger('click')
    myLeagues.value = [{ id: 'L2', name: 'Beta', chatEnabled: true }]
    selectedLeagueId.value = 'L2'
    await nextTick()
    expect(w.findComponent(ChatPanelStub).props('leagueId')).toBe('L2')
  })
})
