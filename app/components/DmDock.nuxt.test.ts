import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import DmDock from './DmDock.vue'

// The dock's crypto/network live in useDms (tested separately); here we drive the
// dock's own view logic against a mocked composable, so no real e2ee/IndexedDB is
// exercised. The mock state is reset per test. Real i18n resolves the dm.* keys,
// so we assert against the English strings the way the sibling chat specs do.
type Thread = {
  threadId: string
  other: { id: string; name: string; image: string | null }
  lastMessageAt: string | null
  unread: number
  myWrappedKey: string | null
}
type Decoded = {
  id: string
  userId: string | null
  parentId: string | null
  epoch: number
  text: string | null
  createdAt: string
  editedAt: string | null
  mine: boolean
}

vi.mock('../composables/useDms', async () => {
  const { ref } = await import('vue')
  const state = {
    threads: { data: ref<Thread[]>([]) },
    totalUnread: ref(0),
    identityStatus: ref<'ready' | 'needs-restore'>('ready'),
    ensureIdentity: vi.fn(async () => {}),
    loadThread: vi.fn(async () => {}),
    threadMessages: vi.fn((): Decoded[] => []),
    otherOf: vi.fn((): { userId: string; name: string; image: string | null; publicKey: string } | null => null),
    send: { mutate: vi.fn(), mutateAsync: vi.fn(async () => {}) },
    edit: { mutate: vi.fn(), mutateAsync: vi.fn(async () => {}) },
    startThread: { mutate: vi.fn(), mutateAsync: vi.fn(async () => 'new-thread') },
    markRead: { mutate: vi.fn(), mutateAsync: vi.fn(async () => {}) },
    searchRecipients: vi.fn(async (): Promise<unknown[]> => []),
  }
  return { useDms: () => state, __dm: state }
})

// signedIn keys the whole dock; drive the session ref per test.
const session = { value: { data: { user: { id: 'me' } } } as { data: { user: { id: string } } | null } | null }
vi.mock('../composables/useAuth', () => ({ useAuth: () => ({ session }) }))
// No deep-link (?dm=) in these tests.
mockNuxtImport('useRoute', () => () => ({ query: {} }) as never)

async function dmState() {
  return ((await import('../composables/useDms')) as unknown as { __dm: Record<string, any> }).__dm
}

const thread = (over: Partial<Thread> = {}): Thread => ({
  threadId: 't1',
  other: { id: 'u1', name: 'Alice', image: null },
  lastMessageAt: '2026-06-10T10:00:00.000Z',
  unread: 0,
  myWrappedKey: 'wrap',
  ...over,
})
const decoded = (over: Partial<Decoded> = {}): Decoded => ({
  id: 'm1',
  userId: 'u1',
  parentId: null,
  epoch: 1,
  text: 'hi there',
  createdAt: '2026-06-10T10:00:00.000Z',
  editedAt: null,
  mine: false,
  ...over,
})

let mounted: Array<{ unmount: () => void }> = []
async function mount() {
  const w = await mountSuspended(DmDock)
  mounted.push(w)
  return w
}
const bubble = (w: Awaited<ReturnType<typeof mount>>) => w.find('button[aria-label="Open direct messages"]')

async function openDock(w: Awaited<ReturnType<typeof mount>>) {
  await bubble(w).trigger('click')
  await vi.waitFor(() => expect((w.find('.ng-card').attributes('style') ?? '')).not.toContain('display: none'))
}

beforeEach(async () => {
  session.value = { data: { user: { id: 'me' } } }
  const s = await dmState()
  s.threads.data.value = []
  s.totalUnread.value = 0
  s.identityStatus.value = 'ready'
  s.threadMessages.mockReturnValue([])
  s.otherOf.mockReturnValue(null)
  s.ensureIdentity.mockClear()
  s.loadThread.mockClear()
  s.markRead.mutate.mockClear()
  s.send.mutateAsync.mockClear()
})
afterEach(() => {
  for (const w of mounted) w.unmount()
  mounted = []
})

describe('DmDock', () => {
  it('renders nothing when signed out', async () => {
    session.value = null
    const w = await mount()
    expect(bubble(w).exists()).toBe(false)
    expect(w.text()).toBe('')
  })

  it('renders the collapsed bubble with the total-unread badge', async () => {
    const s = await dmState()
    s.totalUnread.value = 3
    const w = await mount()
    const b = bubble(w)
    expect(b.exists()).toBe(true)
    // Collapsed by default: the bubble is shown, the panel is hidden.
    expect(b.attributes('style') ?? '').not.toContain('display: none')
    expect(w.find('.ng-card').attributes('style')).toContain('display: none')
    expect(b.text()).toContain('3')
  })

  it('opens the dock to the inbox and ensures the identity', async () => {
    const s = await dmState()
    const w = await mount()
    await openDock(w)
    expect(s.ensureIdentity).toHaveBeenCalled()
    // Now open: the bubble is hidden, the panel (inbox) is shown.
    expect(bubble(w).attributes('style')).toContain('display: none')
    expect(w.text()).toContain('Messages')
  })

  it('shows the empty state with no conversations', async () => {
    const w = await mount()
    await openDock(w)
    expect(w.text()).toContain('No conversations yet.')
  })

  it('lists threads with per-thread unread badges', async () => {
    const s = await dmState()
    s.threads.data.value = [
      thread({ threadId: 't1', other: { id: 'u1', name: 'Alice', image: null }, unread: 2 }),
      thread({ threadId: 't2', other: { id: 'u2', name: 'Bob', image: null }, unread: 0, lastMessageAt: null }),
    ]
    const w = await mount()
    await openDock(w)
    expect(w.text()).toContain('Alice')
    expect(w.text()).toContain('Bob')
    expect(w.text()).not.toContain('No conversations yet.')
    // Alice's row carries a 2-unread badge; Bob's (0 unread) carries none.
    const alice = w.findAll('button').find((b) => b.text().includes('Alice'))!
    expect(alice.text()).toContain('2')
    const bob = w.findAll('button').find((b) => b.text().includes('Bob'))!
    expect(bob.text()).not.toMatch(/\d/)
  })

  it('switches to the new-message search view when the pencil is clicked', async () => {
    const w = await mount()
    await openDock(w)
    await w.find('button[aria-label="New message"]').trigger('click')
    expect(w.find('input[placeholder="Search by name"]').exists()).toBe(true)
    expect(w.text()).toContain('Search for someone to message.')
  })

  it('opens a thread and calls loadThread + markRead, rendering its messages', async () => {
    const s = await dmState()
    s.threads.data.value = [thread({ threadId: 't1', other: { id: 'u1', name: 'Alice', image: null } })]
    s.otherOf.mockReturnValue({ userId: 'u1', name: 'Alice', image: null, publicKey: 'k' })
    s.threadMessages.mockReturnValue([decoded({ id: 'm1', text: 'hi there', mine: false })])
    const w = await mount()
    await openDock(w)
    const row = w.findAll('button').find((b) => b.text().includes('Alice'))!
    await row.trigger('click')
    await vi.waitFor(() => expect(s.loadThread).toHaveBeenCalledWith('t1'))
    expect(s.markRead.mutate).toHaveBeenCalledWith('t1')
    await vi.waitFor(() => expect(w.text()).toContain('hi there'))
  })

  it('sends the typed draft and clears the composer', async () => {
    const s = await dmState()
    s.threads.data.value = [thread({ threadId: 't1', other: { id: 'u1', name: 'Alice', image: null } })]
    s.otherOf.mockReturnValue({ userId: 'u1', name: 'Alice', image: null, publicKey: 'k' })
    s.threadMessages.mockReturnValue([])
    const w = await mount()
    await openDock(w)
    await w.findAll('button').find((b) => b.text().includes('Alice'))!.trigger('click')
    await vi.waitFor(() => expect(s.loadThread).toHaveBeenCalledWith('t1'))
    const composer = w.find('input[placeholder="Message"]')
    await composer.setValue('hello world')
    await w.find('form').trigger('submit')
    expect(s.send.mutateAsync).toHaveBeenCalledWith({ threadId: 't1', text: 'hello world' })
    await vi.waitFor(() => expect((w.find('input[placeholder="Message"]').element as HTMLInputElement).value).toBe(''))
  })

  it('shows the needs-restore notice when the key is missing on this device', async () => {
    const s = await dmState()
    s.identityStatus.value = 'needs-restore'
    const w = await mount()
    await openDock(w)
    expect(w.text()).toContain('Restore your chat key on this device to read your messages.')
    expect(w.text()).not.toContain('No conversations yet.')
  })
})
