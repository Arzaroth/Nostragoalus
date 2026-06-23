import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ChatPanel from './ChatPanel.vue'

// Drive the panel via mocked composables (the crypto/network live in those and
// are tested separately). The mock state objects are mutated per test.
vi.mock('../composables/useLeagueChat', async () => {
  const { ref } = await import('vue')
  const state = {
    enabled: ref(false),
    isAdmin: ref(false),
    ready: ref(false),
    loading: ref(false),
    sending: ref(false),
    messages: ref<Array<{ id: string; userId: string | null; matchId: string | null; text: string | null; createdAt: string }>>([]),
    identityStatus: ref('ready'),
    send: vi.fn(),
    toggleMute: vi.fn(),
    enableChat: vi.fn(),
    disableChat: vi.fn(),
    load: vi.fn(),
  }
  return { useLeagueChat: () => state, __state: state }
})
vi.mock('../composables/useChatIdentity', async () => {
  const { ref } = await import('vue')
  const s = { hasRecovery: ref(true), setupRecovery: vi.fn(), restore: vi.fn() }
  return { useChatIdentity: () => s, __id: s }
})
vi.mock('../composables/useLeagues', async () => {
  const { ref } = await import('vue')
  const data = ref({ members: [{ userId: 'me', name: 'Me' }, { userId: 'other', name: 'Sam' }] })
  return { useLeagueDetail: () => ({ data }) }
})
vi.mock('../composables/useAuth', async () => {
  const { ref } = await import('vue')
  return { useAuth: () => ({ session: ref({ data: { user: { id: 'me' } } }) }) }
})

async function chatState() {
  return ((await import('../composables/useLeagueChat')) as any).__state
}

let mounted: Array<{ unmount: () => void }> = []
beforeEach(async () => {
  const s = await chatState()
  s.enabled.value = false
  s.isAdmin.value = false
  s.ready.value = false
  s.messages.value = []
  s.identityStatus.value = 'ready'
})
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

async function mount() {
  const wrapper = await mountSuspended(ChatPanel, { props: { leagueId: 'L1' } })
  mounted.push(wrapper)
  return wrapper
}

describe('ChatPanel', () => {
  it('offers enable to admins when chat is off', async () => {
    const s = await chatState()
    s.isAdmin.value = true
    const wrapper = await mount()
    expect(wrapper.text()).toContain('Enable chat')
  })

  it('shows the off notice without an enable button for non-admins', async () => {
    const wrapper = await mount()
    expect(wrapper.text()).toContain('Chat is off')
    expect(wrapper.text()).not.toContain('Enable chat')
  })

  it('renders decrypted messages and highlights the caller', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [
      { id: 'a', userId: 'me', matchId: null, text: 'hi all', createdAt: '2026-06-10T10:00:00.000Z' },
      { id: 'b', userId: 'other', matchId: null, text: 'evening', createdAt: '2026-06-10T10:01:00.000Z' },
    ]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('hi all'))
    expect(wrapper.text()).toContain('evening')
    expect(wrapper.text()).toContain('Me')
    expect(wrapper.text()).toContain('Sam')
  })

  it('flags messages it cannot decrypt', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [{ id: 'a', userId: 'other', matchId: null, text: null, createdAt: '2026-06-10T10:00:00.000Z' }]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('no key on this device'))
  })

  it('prompts to restore when the device lacks the key', async () => {
    const s = await chatState()
    s.identityStatus.value = 'needs-restore'
    const wrapper = await mount()
    expect(wrapper.text()).toContain('Restore')
  })
})
