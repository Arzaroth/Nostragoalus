import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ChatPanel from './ChatPanel.vue'
import { generateIdentity } from '../utils/e2ee'
import { chatKeyPins } from '../composables/useChatKeyPins'
import { emptyReactionTotals } from '#shared/reactions'

function msg(over: Record<string, unknown> = {}) {
  return { id: 'a', userId: 'other', matchId: null, parentId: null, text: 'hi', createdAt: '2026-06-10T10:00:00.000Z', editedAt: null, attachments: [], moderation: 'VISIBLE', reported: false, reactions: emptyReactionTotals(), myReaction: null, ...over }
}

// Drive the panel via mocked composables (the crypto/network live in those and
// are tested separately). The mock state objects are mutated per test.
vi.mock('../composables/useLeagueChat', async () => {
  const { ref } = await import('vue')
  const state = {
    enabled: ref(false),
    isAdmin: ref(false),
    ready: ref(false),
    awaitingKey: ref(false),
    loading: ref(false),
    sending: ref(false),
    messages: ref<Array<{ id: string; userId: string | null; matchId: string | null; text: string | null; createdAt: string }>>([]),
    memberKeys: ref<Array<{ userId: string; publicKey: string; name: string }>>([]),
    muted: ref<string[]>([]),
    identityStatus: ref('ready'),
    hasMore: ref(false),
    loadingOlder: ref(false),
    typingUserIds: ref<string[]>([]),
    send: vi.fn(),
    toggleMute: vi.fn(),
    enableChat: vi.fn(),
    disableChat: vi.fn(),
    rotateKey: vi.fn(),
    load: vi.fn(),
    loadOlder: vi.fn(),
    requestRekey: vi.fn(),
    react: vi.fn(),
    sendTyping: vi.fn(),
    roomMedia: vi.fn(async () => []),
    loadAttachment: vi.fn(),
    editMessage: vi.fn(),
    report: vi.fn(),
    moderate: vi.fn(),
    fetchReports: vi.fn(async () => []),
  }
  return { useLeagueChat: () => state, __state: state }
})
vi.mock('../composables/useChatIdentity', async () => {
  const { ref } = await import('vue')
  const { generateIdentity } = await import('../utils/e2ee')
  const s = { identity: ref(await generateIdentity()), hasRecovery: ref(true), setupRecovery: vi.fn(), restore: vi.fn() }
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
  s.awaitingKey.value = false
  s.messages.value = []
  s.memberKeys.value = []
  s.muted.value = []
  s.identityStatus.value = 'ready'
})
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
  // The key-verification pins persist in localStorage (useStorage); reset the
  // shared store so pinned/verified state can't leak between tests.
  chatKeyPins().value = {}
  localStorage.clear()
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
      msg({ id: 'a', userId: 'me', text: 'hi all' }),
      msg({ id: 'b', userId: 'other', text: 'evening', createdAt: '2026-06-10T10:01:00.000Z' }),
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
    s.messages.value = [msg({ id: 'a', userId: 'other', text: null })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('no key on this device'))
  })

  it('shows the waiting-to-be-let-in notice when enabled but keyless', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.awaitingKey.value = true
    const wrapper = await mount()
    expect(wrapper.text()).toContain('Waiting to be let in')
    expect(wrapper.text()).not.toContain('Setting up your key')
  })

  it('shows reaction counts and toggles on click', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [msg({ id: 'a', userId: 'other', text: 'hi', reactions: { ...emptyReactionTotals(), FIRE: 2 }, myReaction: 'FIRE' })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('2'))
    // The existing-count pill is the one marked pressed (myReaction === FIRE).
    const pill = wrapper.find('button[aria-pressed="true"]')
    expect(pill.exists()).toBe(true)
    await pill.trigger('click')
    expect(s.react).toHaveBeenCalledWith('a', 'FIRE')
  })

  it('quotes the parent on a reply and sends with its id', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [
      msg({ id: 'p', userId: 'other', text: 'the original' }),
      msg({ id: 'c', userId: 'me', text: 'the answer', parentId: 'p' }),
    ]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('the answer'))
    // The reply renders a quoted preview of its parent.
    expect(wrapper.text()).toContain('the original')
    // Replying then sending threads the parent id.
    const reply = wrapper.findAll('button[aria-label="Reply"]')
    await reply[0].trigger('click')
    const ta = wrapper.find('textarea')
    await ta.setValue('me too')
    await wrapper.find('form').trigger('submit')
    expect(s.send).toHaveBeenCalledWith('me too', { parentId: 'p', images: [] })
  })

  it('reports another member message', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [msg({ id: 'x', userId: 'other', text: 'spam' })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('spam'))
    const report = wrapper.find('button[aria-label="Report"]')
    await report.trigger('click')
    expect(s.report).toHaveBeenCalledWith('x')
  })

  it('lets the author edit and delete their own message', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [msg({ id: 'x', userId: 'me', text: 'mine', editedAt: '2026-06-10T10:05:00.000Z' })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('mine'))
    // The "edited" marker shows for an edited message.
    expect(wrapper.text()).toContain('edited')
    // Edit -> change text -> save calls editMessage.
    await wrapper.get('button[aria-label="Edit"]').trigger('click')
    const ta = wrapper.find('textarea')
    await ta.setValue('mine v2')
    const save = wrapper.findAll('button').find((b) => b.text() === 'Save')!
    await save.trigger('click')
    expect(s.editMessage).toHaveBeenCalledWith('x', 'mine v2', { addImages: [], removeIdxs: [] })
    // Delete calls moderate(remove).
    await wrapper.get('button[aria-label="Delete"]').trigger('click')
    expect(s.moderate).toHaveBeenCalledWith('x', 'remove')
  })

  it('tombstones a removed message and hides its content', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [msg({ id: 'x', userId: 'other', text: 'was here', moderation: 'REMOVED' })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Message removed'))
    expect(wrapper.text()).not.toContain('was here')
  })

  it('hides a pending message from a non-moderator', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.isAdmin.value = false
    s.messages.value = [msg({ id: 'x', userId: 'other', text: 'under review', moderation: 'PENDING' })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Hidden, pending review'))
    expect(wrapper.text()).not.toContain('under review')
  })

  it('prompts to restore when the device lacks the key', async () => {
    const s = await chatState()
    s.identityStatus.value = 'needs-restore'
    const wrapper = await mount()
    expect(wrapper.text()).toContain('Restore')
  })

  it('offers admins a rotate-key control on a ready chat', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.isAdmin.value = true
    const wrapper = await mount()
    await wrapper.get('button[aria-label="More options"]').trigger('click')
    expect(wrapper.text()).toContain('Rotate key')
  })

  it('lists muted members and offers an unmute', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.muted.value = ['other']
    const wrapper = await mount()
    await wrapper.get('button[aria-label="More options"]').trigger('click')
    const show = wrapper.findAll('button').find((b) => b.text().includes('Muted (1)'))!
    await show.trigger('click')
    expect(wrapper.text()).toContain('Sam')
    const unmute = wrapper.findAll('button').find((b) => b.text() === 'Unmute')!
    await unmute.trigger('click')
    expect(s.toggleMute).toHaveBeenCalledWith('other')
  })

  it('hides the rotate-key control from non-admins', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    const wrapper = await mount()
    expect(wrapper.text()).not.toContain('Rotate key')
  })

  it('shows peer safety numbers in the verify panel', async () => {
    const me = await generateIdentity()
    const other = await generateIdentity()
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.memberKeys.value = [{ userId: 'me', publicKey: me.publicKey, name: 'Me' }, { userId: 'other', publicKey: other.publicKey, name: 'Sam' }]
    const wrapper = await mount()
    await wrapper.get('button[aria-label="More options"]').trigger('click')
    const toggle = wrapper.findAll('button').find((b) => b.text().includes('Verify keys'))!
    await toggle.trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toMatch(/\d{5} \d{5} \d{5} \d{5} \d{5} \d{5}/))
    expect(wrapper.text()).toContain('Your safety number')
    expect(wrapper.text()).toContain('Sam') // the peer's name
  })
})
