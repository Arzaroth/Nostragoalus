import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ChatPanel from './ChatPanel.vue'
import { generateIdentity } from '../utils/e2ee'
import { chatKeyPins } from '../composables/useChatKeyPins'
import { emptyReactionTotals } from '#shared/reactions'

function msg(over: Record<string, unknown> = {}) {
  return { id: 'a', userId: 'other', matchId: null, parentId: null, threadId: null, text: 'hi', createdAt: '2026-06-10T10:00:00.000Z', editedAt: null, attachments: [], moderation: 'VISIBLE', reported: false, reactions: emptyReactionTotals(), myReaction: null, threadCount: 0, ...over }
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
    readMarker: ref<string | null>(null),
    messages: ref<Array<{ id: string; userId: string | null; matchId: string | null; text: string | null; createdAt: string }>>([]),
    memberKeys: ref<Array<{ userId: string; publicKey: string; name: string }>>([]),
    muted: ref<string[]>([]),
    identityStatus: ref('ready'),
    hasMore: ref(false),
    loadingOlder: ref(false),
    typingUserIds: ref<string[]>([]),
    threadParentId: ref<string | null>(null),
    threadMessages: ref<Array<Record<string, unknown>>>([]),
    threadLoading: ref(false),
    openThread: vi.fn(),
    closeThread: vi.fn(),
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
// The DM engine exposes the SAME surface as useLeagueChat; ChatPanel picks it when
// dmThreadId is set. A DM is always on (enabled), has no admin and inert league-only
// ops, so the panel hides the admin/moderation/enable/verify/mention UI in this mode.
vi.mock('../composables/useDmRoom', async () => {
  const { ref, computed } = await import('vue')
  const state = {
    enabled: ref(true),
    isAdmin: computed(() => false),
    ready: ref(false),
    awaitingKey: ref(false),
    loading: ref(false),
    sending: ref(false),
    readMarker: ref<string | null>(null),
    messages: ref<Array<Record<string, unknown>>>([]),
    memberKeys: ref<Array<{ userId: string; publicKey: string; name: string; image: string | null }>>([]),
    muted: ref<string[]>([]),
    identityStatus: ref('ready'),
    hasMore: ref(false),
    loadingOlder: ref(false),
    typingUserIds: ref<string[]>([]),
    threadParentId: ref<string | null>(null),
    threadMessages: ref<Array<Record<string, unknown>>>([]),
    threadLoading: ref(false),
    openThread: vi.fn(),
    closeThread: vi.fn(),
    send: vi.fn(),
    toggleMute: vi.fn(),
    enableChat: vi.fn(),
    disableChat: vi.fn(),
    rotateKey: vi.fn(),
    requestRekey: vi.fn(),
    load: vi.fn(),
    loadOlder: vi.fn(),
    react: vi.fn(),
    sendTyping: vi.fn(),
    roomMedia: vi.fn(async () => []),
    loadAttachment: vi.fn(),
    editMessage: vi.fn(),
    report: vi.fn(),
    moderate: vi.fn(),
    fetchReports: vi.fn(async () => []),
  }
  return { useDmRoom: () => state, __dm: state }
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

async function dmState() {
  return ((await import('../composables/useDmRoom')) as any).__dm
}

let mounted: Array<{ unmount: () => void }> = []
beforeEach(async () => {
  const s = await chatState()
  s.enabled.value = false
  s.isAdmin.value = false
  s.ready.value = false
  s.awaitingKey.value = false
  s.readMarker.value = null
  s.messages.value = []
  s.memberKeys.value = []
  s.muted.value = []
  s.identityStatus.value = 'ready'
  s.threadParentId.value = null
  s.threadMessages.value = []
  s.threadLoading.value = false
  s.openThread.mockReset()
  s.closeThread.mockReset()
  const d = await dmState()
  d.enabled.value = true
  d.ready.value = false
  d.awaitingKey.value = false
  d.readMarker.value = null
  d.messages.value = []
  d.memberKeys.value = []
  d.muted.value = []
  d.identityStatus.value = 'ready'
  d.threadParentId.value = null
  d.threadMessages.value = []
  d.threadLoading.value = false
  d.openThread.mockReset()
  d.closeThread.mockReset()
  d.send.mockReset()
  d.react.mockReset()
  d.editMessage.mockReset()
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

// Set a textarea's value with the caret at the end (jsdom does not move it on
// assignment) so the @mention detector reads the trailing @partial run.
async function typeWithCaret(field: { element: Element; trigger: (e: string) => Promise<void> }, value: string) {
  const el = field.element as HTMLTextAreaElement
  el.value = value
  el.selectionStart = value.length
  el.selectionEnd = value.length
  await field.trigger('input')
}

async function dmMount() {
  const wrapper = await mountSuspended(ChatPanel, { props: { dmThreadId: 'T1' } })
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

  it('draws a new-messages divider at the last-read boundary', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    // Read up to 10:00:30; the 10:01 message from another member is the first unread.
    s.readMarker.value = '2026-06-10T10:00:30.000Z'
    s.messages.value = [
      msg({ id: 'a', userId: 'other', text: 'seen already', createdAt: '2026-06-10T10:00:00.000Z' }),
      msg({ id: 'b', userId: 'other', text: 'brand new', createdAt: '2026-06-10T10:01:00.000Z' }),
    ]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('brand new'))
    expect(wrapper.text()).toContain('New messages')
  })

  it('shows no divider once everything is read', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.readMarker.value = '2026-06-10T11:00:00.000Z'
    s.messages.value = [msg({ id: 'a', userId: 'other', text: 'seen', createdAt: '2026-06-10T10:00:00.000Z' })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('seen'))
    expect(wrapper.text()).not.toContain('New messages')
  })

  it('does not draw the divider before the reader\'s own message', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    // The only message newer than the marker is the reader's own: no divider, so a
    // room you just posted in does not show a spurious "new messages" line on reopen.
    s.readMarker.value = '2026-06-10T10:00:30.000Z'
    s.messages.value = [
      msg({ id: 'a', userId: 'other', text: 'seen already', createdAt: '2026-06-10T10:00:00.000Z' }),
      msg({ id: 'b', userId: 'me', text: 'my own reply', createdAt: '2026-06-10T10:01:00.000Z' }),
    ]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('my own reply'))
    expect(wrapper.text()).not.toContain('New messages')
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

  it('quotes a message in the main list and sends with its parent id', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [msg({ id: 'p', userId: 'other', text: 'the original' })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('the original'))
    // The Reply action quotes the message (stays in the main list).
    await wrapper.findAll('button[aria-label="Reply"]')[0].trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Replying to'))
    await wrapper.find('textarea').setValue('me too')
    await wrapper.find('form').trigger('submit')
    expect(s.send).toHaveBeenCalledWith('me too', { parentId: 'p', images: [], mentions: [] })
  })

  it('opens a thread and sends a reply with its thread id', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [msg({ id: 'p', userId: 'other', text: 'the original', threadCount: 1 })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('the original'))
    // The thread action opens that message's thread (replies live there, not inline).
    await wrapper.findAll('button[aria-label="Reply in thread"]')[0].trigger('click')
    expect(s.openThread).toHaveBeenCalledWith('p')
    // With the thread open, its replies render and the thread composer threads it.
    s.threadParentId.value = 'p'
    s.threadMessages.value = [msg({ id: 'c', userId: 'me', text: 'the answer' })]
    await vi.waitFor(() => expect(wrapper.text()).toContain('the answer'))
    await wrapper.find('[data-thread="p"] textarea').setValue('me too')
    await wrapper.find('[data-thread="p"] form').trigger('submit')
    expect(s.send).toHaveBeenCalledWith('me too', { threadId: 'p', mentions: [] })
  })

  it('filters the loaded messages by a search query', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [
      msg({ id: 'a', userId: 'other', text: 'hello world' }),
      msg({ id: 'b', userId: 'me', text: 'goodbye moon' }),
    ]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('hello world'))
    await wrapper.get('button[aria-label="Search messages"]').trigger('click')
    await wrapper.find('input').setValue('moon')
    await vi.waitFor(() => expect(wrapper.text()).toContain('goodbye moon'))
    expect(wrapper.text()).not.toContain('hello world')
  })

  it('encodes an @mention display name to a stable id token on send', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    const wrapper = await mount()
    // The composer shows the member's name; it is encoded to @<id> on the wire.
    await wrapper.find('textarea').setValue('hi @Sam')
    await wrapper.find('form').trigger('submit')
    expect(s.send).toHaveBeenCalledWith('hi @<other>', { parentId: null, images: [], mentions: ['other'] })
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

  it('decodes a mention id to a name in a quoted parent preview', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    // A reply whose parent @-mentions someone: the quote preview shows @Sam, not
    // the raw @<other> id token.
    s.messages.value = [
      msg({ id: 'p', userId: 'me', text: 'hey @<other>' }),
      msg({ id: 'c', userId: 'other', parentId: 'p', text: 'answer', createdAt: '2026-06-10T10:01:00.000Z' }),
    ]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('answer'))
    expect(wrapper.text()).toContain('hey @Sam')
    expect(wrapper.text()).not.toContain('@<other>')
  })

  it('decodes a mention id to a name in the reply banner', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [msg({ id: 'p', userId: 'other', text: 'hey @<other>' })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('hey @Sam'))
    await wrapper.findAll('button[aria-label="Reply"]')[0].trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Replying to'))
    expect(wrapper.text()).not.toContain('@<other>')
  })

  it('autocompletes an @mention in the thread reply composer', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [msg({ id: 'p', userId: 'other', text: 'orig', threadCount: 0 })]
    s.threadParentId.value = 'p'
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.find('[data-thread="p"] textarea').exists()).toBe(true))
    await typeWithCaret(wrapper.find('[data-thread="p"] textarea'), '@Sa')
    const pick = wrapper.findAll('[data-thread="p"] form button').find((b) => b.text() === 'Sam')
    expect(pick).toBeTruthy()
    await wrapper.find('[data-thread="p"] textarea').trigger('keydown', { key: 'Enter' })
    await wrapper.find('[data-thread="p"] form').trigger('submit')
    expect(s.send).toHaveBeenCalledWith('@<other> ', { threadId: 'p', mentions: ['other'] })
  })

  it('autocompletes an @mention while editing a message', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    s.messages.value = [msg({ id: 'x', userId: 'me', text: 'mine' })]
    const wrapper = await mount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('mine'))
    await wrapper.get('button[aria-label="Edit"]').trigger('click')
    await typeWithCaret(wrapper.find('[data-mid="x"] textarea'), '@Sa')
    const pick = wrapper.findAll('[data-mid="x"] button').find((b) => b.text() === 'Sam')
    expect(pick).toBeTruthy()
    await wrapper.find('[data-mid="x"] textarea').trigger('keydown', { key: 'Enter' })
    const save = wrapper.findAll('button').find((b) => b.text() === 'Save')!
    await save.trigger('click')
    expect(s.editMessage).toHaveBeenCalledWith('x', '@<other> ', { addImages: [], removeIdxs: [] })
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

  it('regenerates the recovery code from the danger zone, behind a confirm', async () => {
    const s = await chatState()
    s.enabled.value = true
    s.ready.value = true
    const id = ((await import('../composables/useChatIdentity')) as any).__id
    id.setupRecovery.mockClear()
    const wrapper = await mount()
    await wrapper.get('button[aria-label="More options"]').trigger('click')
    const item = wrapper.findAll('button').find((b) => b.text().includes('Regenerate recovery code'))!
    expect(item).toBeTruthy()
    await item.trigger('click')
    // The confirm (a teleported Dialog) spells out that the old code is
    // invalidated - and does NOT act until the user confirms.
    await vi.waitFor(() => expect(document.body.textContent).toContain('Your current recovery code stops working'))
    expect(id.setupRecovery).not.toHaveBeenCalled()
    const confirm = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Regenerate')!
    expect(confirm).toBeTruthy()
    confirm.dispatchEvent(new Event('click', { bubbles: true }))
    await vi.waitFor(() => expect(id.setupRecovery).toHaveBeenCalled())
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
    // The verify panel is a modal dialog now (teleported to body), so assert
    // against the document rather than the component's own subtree.
    await vi.waitFor(() => expect(document.body.textContent).toMatch(/\d{5} \d{5} \d{5} \d{5} \d{5} \d{5}/))
    expect(document.body.textContent).toContain('Your safety number')
    expect(document.body.textContent).toContain('Sam') // the peer's name
  })
})

describe('ChatPanel DM mode', () => {
  async function readyDm() {
    const me = await generateIdentity()
    const other = await generateIdentity()
    const d = await dmState()
    d.ready.value = true
    // Real (base64) keys so the always-running key-verification composable can
    // fingerprint the two-person roster, even though its UI is hidden in a DM.
    d.memberKeys.value = [
      { userId: 'me', publicKey: me.publicKey, name: 'Me', image: null },
      { userId: 'other', publicKey: other.publicKey, name: 'Sam', image: null },
    ]
    return d
  }

  it('renders the message stack (names, reactions) from the DM roster, not league detail', async () => {
    const d = await readyDm()
    d.messages.value = [msg({ id: 'a', userId: 'other', text: 'hey there', reactions: { ...emptyReactionTotals(), FIRE: 1 }, myReaction: 'FIRE' })]
    const wrapper = await dmMount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('hey there'))
    // Name resolves from memberKeys (no league-detail query in a DM).
    expect(wrapper.text()).toContain('Sam')
    // Reaction pill is present and toggles.
    const pill = wrapper.find('button[aria-pressed="true"]')
    expect(pill.exists()).toBe(true)
    await pill.trigger('click')
    expect(d.react).toHaveBeenCalledWith('a', 'FIRE')
  })

  it('keeps reply, react, media and own-message edit available', async () => {
    const d = await readyDm()
    d.messages.value = [msg({ id: 'x', userId: 'me', text: 'mine' })]
    const wrapper = await dmMount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('mine'))
    expect(wrapper.find('button[aria-label="Reply"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Add reaction"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Media"]').exists()).toBe(true)
    // The author can still edit their own DM message.
    await wrapper.get('button[aria-label="Edit"]').trigger('click')
    await wrapper.find('textarea').setValue('mine v2')
    const save = wrapper.findAll('button').find((b) => b.text() === 'Save')!
    await save.trigger('click')
    expect(d.editMessage).toHaveBeenCalledWith('x', 'mine v2', { addImages: [], removeIdxs: [] })
  })

  it('hides the moderation and enable UI in a DM', async () => {
    const d = await readyDm()
    d.messages.value = [
      msg({ id: 'a', userId: 'other', text: 'from sam' }),
      msg({ id: 'b', userId: 'me', text: 'from me' }),
    ]
    const wrapper = await dmMount()
    await vi.waitFor(() => expect(wrapper.text()).toContain('from sam'))
    // No report on a peer message, no delete on the caller's own, no enable notice.
    expect(wrapper.find('button[aria-label="Report"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Delete"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Enable chat')
    expect(wrapper.text()).not.toContain('Chat is off')
  })

  it('offers key verification but no league/admin items in a DM overflow menu', async () => {
    await readyDm()
    const wrapper = await dmMount()
    // Key verification and identity recovery apply to a DM (same E2EE identity), so
    // the overflow menu is present; the league-only rotate/moderation items are not.
    const menu = wrapper.find('button[aria-label="More options"]')
    expect(menu.exists()).toBe(true)
    await menu.trigger('click')
    expect(wrapper.text()).toContain('Verify keys')
    expect(wrapper.text()).not.toContain('Rotate key')
  })

  it('offers no @mention autocomplete in a DM', async () => {
    await readyDm()
    const wrapper = await dmMount()
    await wrapper.find('textarea').setValue('hi @S')
    await wrapper.vm.$nextTick()
    // The mention popup (unique .w-64 container) never renders in DM mode.
    expect(wrapper.find('.w-64').exists()).toBe(false)
  })
})
