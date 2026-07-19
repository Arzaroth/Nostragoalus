import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useDmRoom } from './useDmRoom'
import { chatKeyPins } from './useChatKeyPins'
import { encryptMessage, generateGroupKey, generateIdentity, sealGroupKey, type Identity } from '~/utils/e2ee'

// A plain { value } holder is enough - useDmRoom reads identity.value imperatively and
// never depends on it reactively - and it lets the hoisted mock share the test's key.
const mocks = vi.hoisted(() => ({ identity: { value: null as Identity | null } }))

vi.mock('./useAuth', async () => {
  const { ref } = await import('vue')
  const session = ref({ data: { user: { id: 'me', name: 'Me', image: null } } })
  return { useAuth: () => ({ session }) }
})
vi.mock('./useReconnectingSocket', () => ({
  useReconnectingSocket: () => ({ send: () => false }),
}))
vi.mock('./useChatIdentity', async () => {
  const { ref } = await import('vue')
  return { useChatIdentity: () => ({ identity: mocks.identity, ensure: vi.fn(), status: ref('ready') }) }
})

let me: Identity
let other: Identity
let myWrapped: string
let keysPosts: Array<{ targetUserId: string; epoch: number; wrappedKey: string }>
let otherMissing: boolean
let groupKey: Uint8Array
// A test can hand the message POST its own behaviour (hang, fail, answer).
let onMessagePost: ((body: Record<string, unknown>) => Promise<unknown>) | null

beforeEach(async () => {
  me = await generateIdentity()
  other = await generateIdentity()
  mocks.identity.value = me
  onMessagePost = null
  groupKey = await generateGroupKey()
  myWrapped = await sealGroupKey(groupKey, me.publicKey)
  keysPosts = []
  otherMissing = true
  chatKeyPins().value = {}
  const fetchMock = vi.fn(async (url: string, o?: { method?: string; body?: Record<string, unknown> }) => {
    if (url === '/api/dm/T1') {
      return {
        thread: {
          threadId: 'T1',
          epoch: 1,
          other: { userId: 'other', publicKey: other.publicKey, name: 'Sam', image: null },
          myWrappedKeys: [{ epoch: 1, wrappedKey: myWrapped }],
          otherMissingCurrentKey: otherMissing,
        },
      }
    }
    if (url === '/api/dm/T1/messages') {
      if (o?.method === 'POST') return onMessagePost!(o.body!)
      return { messages: [], readMarker: null }
    }
    if (url === '/api/dm/T1/keys') {
      keysPosts.push(o!.body as { targetUserId: string; epoch: number; wrappedKey: string })
      return { added: 1 }
    }
    return {}
  })
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => {
  chatKeyPins().value = {}
  vi.unstubAllGlobals()
})

async function setup() {
  let api!: ReturnType<typeof useDmRoom>
  await mountSuspended({
    setup() {
      api = useDmRoom('T1')
      return () => null
    },
  })
  await vi.waitFor(() => expect(api.ready.value).toBe(true))
  return api
}

describe('useDmRoom peer key re-seal', () => {
  it('re-seals the thread key to a peer missing it when their key is trusted (TOFU)', async () => {
    await setup()
    await vi.waitFor(() => expect(keysPosts.length).toBe(1))
    expect(keysPosts[0].targetUserId).toBe('other')
    expect(keysPosts[0].epoch).toBe(1)
    expect(keysPosts[0].wrappedKey).toBeTruthy()
  })

  it('does NOT re-seal to a peer whose key changed under our pin until it is acknowledged', async () => {
    // The peer was pinned to an OLD key: their new key is untrusted, so no re-seal.
    chatKeyPins().value = { other: 'a-different-old-key' }
    await setup()
    await new Promise((r) => setTimeout(r, 0))
    expect(keysPosts).toEqual([])
    // Acknowledging the change (re-pinning the new key) triggers the re-seal.
    chatKeyPins().value = { ...chatKeyPins().value, other: other.publicKey }
    await vi.waitFor(() => expect(keysPosts.length).toBe(1))
    expect(keysPosts[0].targetUserId).toBe('other')
  })

  it('does not re-seal when the peer already holds the current key', async () => {
    otherMissing = false
    await setup()
    await new Promise((r) => setTimeout(r, 0))
    expect(keysPosts).toEqual([])
  })
})

describe('useDmRoom optimistic send', () => {
  it('shows the message as pending while in flight, then swaps in the server row', async () => {
    let release!: (v: unknown) => void
    onMessagePost = () => new Promise((r) => (release = r))
    const api = await setup()
    void api.send('hello')
    await vi.waitFor(() => expect(api.messages.value.length).toBe(1))
    expect(api.messages.value[0]).toMatchObject({ text: 'hello', userId: 'me', pending: true })

    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    release({
      message: {
        id: 'M1',
        userId: 'me',
        epoch: 1,
        ciphertext: await encryptMessage('hello', groupKey),
        createdAt: new Date().toISOString(),
      },
    })
    await vi.waitFor(() => expect(api.messages.value[0]!.id).toBe('M1'))
    expect(api.messages.value).toHaveLength(1)
    expect(api.messages.value[0]!.pending).toBeUndefined()
  })

  it('keeps a failed send as a retryable bubble instead of dropping it', async () => {
    onMessagePost = () => Promise.reject(new Error('offline'))
    const api = await setup()
    await api.send('hello')
    expect(api.messages.value[0]).toMatchObject({ text: 'hello', pending: false, failed: true })
    const localId = api.messages.value[0]!.id

    onMessagePost = async () => ({
      message: { id: 'M2', userId: 'me', epoch: 1, ciphertext: await encryptMessage('hello', groupKey), createdAt: new Date().toISOString() },
    })
    await api.retrySend(localId)
    expect(api.messages.value).toHaveLength(1)
    expect(api.messages.value[0]).toMatchObject({ id: 'M2', text: 'hello' })
  })

  it('discards a failed send on request', async () => {
    onMessagePost = () => Promise.reject(new Error('offline'))
    const api = await setup()
    await api.send('hello')
    api.discardSend(api.messages.value[0]!.id)
    expect(api.messages.value).toEqual([])
  })
})
