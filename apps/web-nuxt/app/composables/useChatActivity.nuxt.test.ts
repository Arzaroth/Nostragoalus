import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQueryClient, type QueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { ref } from 'vue'
import { GLOBAL_ROOM, useChatActivity } from './useChatActivity'
import type { ChatUnreadRoomDTO } from '#shared/types/chat'

vi.mock('./useAuth', async () => {
  const { ref } = await import('vue')
  const session = ref<{ data: { user: { id: string } } | null }>({ data: { user: { id: 'me' } } })
  return { useAuth: () => ({ session }), __session: session }
})

// Capture the socket options so a test can drive frames directly; no real
// WebSocket in the test env.
vi.mock('./useReconnectingSocket', () => {
  const opts: { current: { onOpen?: () => void; onMessage: (d: unknown) => void } | null } = { current: null }
  return {
    useReconnectingSocket: (o: { onOpen?: () => void; onMessage: (d: unknown) => void }) => {
      opts.current = o
      return { send: () => false }
    },
    __opts: opts,
  }
})

function room(over: Partial<ChatUnreadRoomDTO> = {}): ChatUnreadRoomDTO {
  return {
    leagueId: 'L1',
    leagueName: 'Friends',
    competitionSlug: 'world-cup-2026',
    roomKey: GLOBAL_ROOM,
    matchId: null,
    homeTeam: null,
    awayTeam: null,
    unread: 1,
    mentions: 0,
    lastAt: '2026-06-15T00:00:00.000Z',
    ...over,
  }
}

let fetchMock: ReturnType<typeof vi.fn>
let rooms: ChatUnreadRoomDTO[]
let reads: Array<{ leagueId: string; roomKey: string }>
let lastQc: QueryClient | undefined

beforeEach(() => {
  rooms = [room()]
  reads = []
  fetchMock = vi.fn(async (url: string, o?: { body?: { leagueId: string; roomKey: string } }) => {
    if (url === '/api/chat/unread') return { rooms }
    if (url === '/api/chat/read') {
      if (o?.body) reads.push(o.body)
      return {}
    }
    return {}
  })
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => {
  lastQc?.clear()
  vi.unstubAllGlobals()
})

async function setup(opts: { readable?: boolean } = {}) {
  const readable = ref(opts.readable ?? false)
  let api!: ReturnType<typeof useChatActivity>
  await mountSuspended({
    setup() {
      lastQc = useQueryClient()
      api = useChatActivity({ activeLeagueId: ref('L1'), activeRoom: ref(GLOBAL_ROOM), readable })
      return () => null
    },
  })
  // Let the unread query settle so markSeen can find the active room.
  await vi.waitFor(() => expect(api.rooms.value.length).toBeGreaterThan(0))
  return { api, readable }
}

describe('useChatActivity read-gating', () => {
  it('does not mark an open-but-undecryptable room read', async () => {
    // The active room is on screen and has unread, but is not readable (no key
    // on this device yet): it must stay unread, so no read receipt goes out.
    await setup({ readable: false })
    await new Promise((r) => setTimeout(r, 0))
    expect(reads).toEqual([])
  })

  it('marks the room read once it becomes readable', async () => {
    const { readable } = await setup({ readable: false })
    readable.value = true
    await vi.waitFor(() => expect(reads).toContainEqual({ leagueId: 'L1', roomKey: GLOBAL_ROOM }))
  })
})

describe('useChatActivity hasUnreadInLeague', () => {
  it('flags a league whose only unread sits in a match thread, not the global room', async () => {
    rooms = [
      room({ leagueId: 'L1', roomKey: GLOBAL_ROOM, unread: 0 }),
      room({ leagueId: 'L1', roomKey: 'M1', matchId: 'M1', unread: 3 }),
      room({ leagueId: 'L2', roomKey: GLOBAL_ROOM, unread: 1 }),
    ]
    const { api } = await setup()
    expect(api.hasUnreadInLeague('L1')).toBe(true)
    expect(api.hasUnreadInLeague('L2')).toBe(true)
    expect(api.hasUnreadInLeague('L3')).toBe(false)
    expect(api.hasUnreadInLeague(null)).toBe(false)
  })
})
