import { useStorage } from '@vueuse/core'
import {
  decryptMessage,
  encryptMessage,
  generateGroupKey,
  openGroupKey,
  sealGroupKey,
} from '~/utils/e2ee'
import type { ChatMessageDTO } from '#shared/types/chat'

export interface DecryptedMessage {
  id: string
  userId: string | null
  matchId: string | null
  text: string | null // null = could not decrypt (wrong/absent key)
  createdAt: string
}

interface ChatStatus {
  enabled: boolean
  epoch: number
  role: 'OWNER' | 'MODERATOR' | 'MEMBER'
  myWrappedKeys: { epoch: number; wrappedKey: string }[]
  missingKeys: { userId: string; publicKey: string }[]
  memberKeys: { userId: string; publicKey: string }[]
}

// One chat room: the league-global room (matchId null) or a per-match thread.
// Holds the unwrapped group key in memory, decrypts history + live messages, and
// (for keyholders) lazily wraps the key for members who don't have it yet.
export function useLeagueChat(
  leagueId: MaybeRefOrGetter<string>,
  matchId?: MaybeRefOrGetter<string | null>,
) {
  const { identity, ensure, status: identityStatus } = useChatIdentity()

  const enabled = ref(false)
  const epoch = ref(0)
  const role = ref<ChatStatus['role'] | null>(null)
  // The group key for every epoch the caller can open, so old history stays
  // readable after a re-key. Each message is decrypted with its own epoch's key.
  const keys = ref<Map<number, Uint8Array>>(new Map())
  const messages = ref<DecryptedMessage[]>([])
  const memberKeys = ref<{ userId: string; publicKey: string }[]>([])
  const loading = ref(false)
  const sending = ref(false)

  const isAdmin = computed(() => role.value === 'OWNER' || role.value === 'MODERATOR')
  const currentKey = computed<Uint8Array | null>(() => keys.value.get(epoch.value) ?? null)
  const ready = computed(() => enabled.value && !!currentKey.value)

  // Client-side mute list (per device): the owner is server-blind, so abuse
  // handling is the member's own mute plus league-admin action.
  const muted = useStorage<string[]>('ng-chat-muted', [])
  const visibleMessages = computed(() => messages.value.filter((m) => !m.userId || !muted.value.includes(m.userId)))
  function toggleMute(userId: string) {
    const set = new Set(muted.value)
    set.has(userId) ? set.delete(userId) : set.add(userId)
    muted.value = [...set]
  }

  function lid(): string {
    return toValue(leagueId)
  }
  function mid(): string | null {
    return toValue(matchId) ?? null
  }

  async function decryptRow(r: ChatMessageDTO): Promise<DecryptedMessage> {
    let text: string | null = null
    const key = keys.value.get(r.epoch)
    if (key) {
      try {
        text = await decryptMessage(r.ciphertext, key)
      } catch {
        text = null
      }
    }
    return { id: r.id, userId: r.userId, matchId: r.matchId, text, createdAt: r.createdAt }
  }

  async function loadMessages(): Promise<void> {
    const m = mid()
    const { messages: rows } = await $fetch<{ messages: ChatMessageDTO[] }>(`/api/leagues/${lid()}/chat/messages`, {
      query: m ? { matchId: m } : {},
    })
    // The API returns newest-first; show oldest-first.
    messages.value = await Promise.all([...rows].reverse().map(decryptRow))
  }

  // Keyholders seal the current group key for members who don't have it yet.
  async function reconcileKeys(missing: { userId: string; publicKey: string }[]): Promise<void> {
    const ck = currentKey.value
    if (!ck || missing.length === 0) return
    const wraps = await Promise.all(
      missing.map(async (m) => ({ userId: m.userId, wrappedKey: await sealGroupKey(ck, m.publicKey) })),
    )
    await $fetch(`/api/leagues/${lid()}/chat/keys`, { method: 'POST', body: { epoch: epoch.value, wraps } }).catch(() => {})
  }

  async function load(): Promise<void> {
    if (!import.meta.client) return
    loading.value = true
    try {
      let status: ChatStatus
      try {
        status = await $fetch<ChatStatus>(`/api/leagues/${lid()}/chat`)
      } catch {
        // Not a member (404) or transient error: nothing to show.
        enabled.value = false
        keys.value = new Map()
        messages.value = []
        return
      }
      enabled.value = status.enabled
      epoch.value = status.epoch
      role.value = status.role
      memberKeys.value = status.memberKeys
      keys.value = new Map()
      messages.value = []
      if (!status.enabled) return
      await ensure()
      if (identity.value && status.myWrappedKeys.length > 0) {
        const map = new Map<number, Uint8Array>()
        for (const wk of status.myWrappedKeys) {
          try {
            map.set(wk.epoch, await openGroupKey(wk.wrappedKey, identity.value))
          } catch {
            // Skip an epoch we cannot open (e.g. a stuck/foreign wrap); others still work.
          }
        }
        keys.value = map
      }
      await reconcileKeys(status.missingKeys)
      await loadMessages()
    } finally {
      loading.value = false
    }
  }

  async function send(text: string): Promise<void> {
    const body = text.trim()
    const ck = currentKey.value
    if (!body || !ck || sending.value) return
    sending.value = true
    try {
      const ciphertext = await encryptMessage(body, ck)
      const { message } = await $fetch<{ message: ChatMessageDTO }>(`/api/leagues/${lid()}/chat/messages`, {
        method: 'POST',
        body: { matchId: mid(), ciphertext, epoch: epoch.value },
      })
      // Append our own message from the POST response; the WS echo (chat:new)
      // dedupes on id, so we don't depend on it to see what we just sent.
      if (message && !messages.value.some((m) => m.id === message.id)) {
        messages.value = [...messages.value, await decryptRow(message)]
      }
    } finally {
      sending.value = false
    }
  }

  // Enable chat for the whole league (OWNER/MODERATOR). Generates the group key
  // and seals it to every member who has a chat identity (the caller included,
  // after ensure() registers theirs).
  async function enableChat(): Promise<void> {
    await ensure()
    if (!identity.value) throw new Error('chat identity not ready')
    const fresh = await $fetch<ChatStatus>(`/api/leagues/${lid()}/chat`)
    // Only the first enable (epoch 0) generates and distributes a group key.
    // Re-enabling a league that was turned off reuses the existing key so prior
    // history stays decryptable, so no new key is generated here.
    let wraps: { userId: string; wrappedKey: string }[] = []
    if (fresh.epoch === 0) {
      const gk = await generateGroupKey()
      wraps = await Promise.all(
        fresh.memberKeys.map(async (m) => ({ userId: m.userId, wrappedKey: await sealGroupKey(gk, m.publicKey) })),
      )
    }
    await $fetch(`/api/leagues/${lid()}/chat/enable`, { method: 'POST', body: { wraps } })
    await load()
  }

  async function disableChat(): Promise<void> {
    await $fetch(`/api/leagues/${lid()}/chat/disable`, { method: 'POST' })
    await load()
  }

  // Rotate the league group key (OWNER/MODERATOR): a fresh key sealed to the
  // current members, bumping the epoch. Members no longer in the league lose
  // access to new messages; old history stays readable for whoever kept the old
  // key. Also the recovery path for a member stuck with an unopenable wrap.
  async function rotateKey(): Promise<void> {
    await ensure()
    if (!identity.value) throw new Error('chat identity not ready')
    const fresh = await $fetch<ChatStatus>(`/api/leagues/${lid()}/chat`)
    const gk = await generateGroupKey()
    const wraps = await Promise.all(
      fresh.memberKeys.map(async (m) => ({ userId: m.userId, wrappedKey: await sealGroupKey(gk, m.publicKey) })),
    )
    await $fetch(`/api/leagues/${lid()}/chat/rotate`, { method: 'POST', body: { wraps } })
    await load()
  }

  useReconnectingSocket({
    onOpen: () => {
      void load()
    },
    onMessage: (data) => {
      const msg = data as { type?: string; leagueId?: string; message?: ChatMessageDTO }
      if (msg.type !== 'chat:new' || msg.leagueId !== lid() || !msg.message) return
      if ((msg.message.matchId ?? null) !== mid()) return
      if (messages.value.some((m) => m.id === msg.message!.id)) return
      void decryptRow(msg.message).then((m) => {
        messages.value = [...messages.value, m]
      })
    },
  })

  watch(() => [toValue(leagueId), toValue(matchId)], () => void load(), { immediate: true })

  return {
    enabled,
    epoch,
    role,
    isAdmin,
    ready,
    loading,
    sending,
    messages: visibleMessages,
    muted,
    toggleMute,
    identityStatus,
    load,
    send,
    enableChat,
    disableChat,
    rotateKey,
  }
}
