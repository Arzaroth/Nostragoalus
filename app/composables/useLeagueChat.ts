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
  myWrappedKey: string | null
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
  const groupKey = ref<Uint8Array | null>(null)
  const messages = ref<DecryptedMessage[]>([])
  const memberKeys = ref<{ userId: string; publicKey: string }[]>([])
  const loading = ref(false)
  const sending = ref(false)

  const isAdmin = computed(() => role.value === 'OWNER' || role.value === 'MODERATOR')
  const ready = computed(() => enabled.value && !!groupKey.value)

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
    if (groupKey.value && r.epoch === epoch.value) {
      try {
        text = await decryptMessage(r.ciphertext, groupKey.value)
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

  // Keyholders seal the group key for members who don't have it at this epoch.
  async function reconcileKeys(missing: { userId: string; publicKey: string }[]): Promise<void> {
    if (!groupKey.value || missing.length === 0) return
    const wraps = await Promise.all(
      missing.map(async (m) => ({ userId: m.userId, wrappedKey: await sealGroupKey(groupKey.value!, m.publicKey) })),
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
        groupKey.value = null
        messages.value = []
        return
      }
      enabled.value = status.enabled
      epoch.value = status.epoch
      role.value = status.role
      memberKeys.value = status.memberKeys
      groupKey.value = null
      messages.value = []
      if (!status.enabled) return
      await ensure()
      if (status.myWrappedKey && identity.value) {
        try {
          groupKey.value = await openGroupKey(status.myWrappedKey, identity.value)
        } catch {
          groupKey.value = null
        }
      }
      await reconcileKeys(status.missingKeys)
      await loadMessages()
    } finally {
      loading.value = false
    }
  }

  async function send(text: string): Promise<void> {
    const body = text.trim()
    if (!body || !groupKey.value || sending.value) return
    sending.value = true
    try {
      const ciphertext = await encryptMessage(body, groupKey.value)
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
  }
}
