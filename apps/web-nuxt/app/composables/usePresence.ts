import { effectScope } from 'vue'
import { useIdle } from '@vueuse/core'

export type PresenceStatus = 'active' | 'idle' | 'offline'

// 15 minutes without interaction flips us to idle (yellow); any input is active
// (green). A closed connection is offline (no dot).
const IDLE_AFTER = 15 * 60 * 1000

// App-wide singleton: one shared presence map fed by one socket handler, plus one
// idle watcher that reports our own state. Set up lazily in a DETACHED effect
// scope so it lives for the whole session no matter which component reads it
// first (and is never torn down when that component unmounts).
const presence = ref<Record<string, Exclude<PresenceStatus, 'offline'>>>({})
let started = false

function start(): void {
  if (started || !import.meta.client) return
  started = true
  effectScope(true).run(() => {
    const { idle } = useIdle(IDLE_AFTER)
    let socket: { send: (payload: unknown) => boolean } | null = null
    const ping = () => {
      socket?.send({ type: 'presence:ping', active: !idle.value })
    }
    socket = useReconnectingSocket({
      onOpen: ping,
      onMessage: (data) => {
        const msg = data as {
          type?: string
          userId?: string
          status?: PresenceStatus
          users?: Record<string, Exclude<PresenceStatus, 'offline'>>
        }
        if (msg.type === 'presence:snapshot' && msg.users) {
          presence.value = { ...msg.users }
        } else if (msg.type === 'presence:update' && msg.userId && msg.status) {
          if (msg.status === 'offline') {
            const next = { ...presence.value }
            delete next[msg.userId]
            presence.value = next
          } else {
            presence.value = { ...presence.value, [msg.userId]: msg.status }
          }
        }
      },
    })
    // Tell the server whenever we flip active <-> idle.
    watch(idle, ping)
  })
}

export function usePresence() {
  start()
  function statusOf(userId: string | null | undefined): PresenceStatus {
    return (userId && presence.value[userId]) || 'offline'
  }
  return { presence, statusOf }
}
