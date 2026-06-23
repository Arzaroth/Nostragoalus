import { useStorage } from '@vueuse/core'
import {
  decryptMessage,
  encryptMessage,
  generateGroupKey,
  openGroupKey,
  sealGroupKey,
} from '~/utils/e2ee'
import { chatKeyPins, isKeyTrusted } from '~/composables/useChatKeyPins'
import { emptyReactionTotals, type ReactionEmoji, type ReactionTotals } from '#shared/reactions'
import type { ChatMessageDTO } from '#shared/types/chat'

export interface DecryptedMessage {
  id: string
  userId: string | null
  matchId: string | null
  parentId: string | null
  text: string | null // null = could not decrypt (wrong/absent key)
  createdAt: string
  reactions: ReactionTotals
  myReaction: ReactionEmoji | null
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
  // Chat is on and loaded, but no keyholder has sealed the current key to us yet
  // (we just joined, or our wrap is stuck): we wait for one to come online and
  // re-seal. Distinct from the brief initial load and from needs-restore (which
  // has its own UI), so the panel can show an explicit "waiting" message.
  const awaitingKey = computed(
    () => enabled.value && !loading.value && !currentKey.value && identityStatus.value !== 'needs-restore',
  )

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
    return {
      id: r.id,
      userId: r.userId,
      matchId: r.matchId,
      parentId: r.parentId ?? null,
      text,
      createdAt: r.createdAt,
      reactions: r.reactions ?? emptyReactionTotals(),
      myReaction: r.myReaction ?? null,
    }
  }

  async function loadMessages(): Promise<void> {
    const m = mid()
    const { messages: rows } = await $fetch<{ messages: ChatMessageDTO[] }>(`/api/leagues/${lid()}/chat/messages`, {
      query: m ? { matchId: m } : {},
    })
    // The API returns newest-first; show oldest-first.
    messages.value = await Promise.all([...rows].reverse().map(decryptRow))
  }

  const pins = chatKeyPins()
  // Never hand the group key to a member whose identity key changed under our pin
  // until the user accepts it (verify/acknowledge). First-seen and unchanged keys
  // are trusted (TOFU); this turns the verify panel from detection into prevention
  // of an automatic key leak to a substituted key.
  function trustedTargets(list: { userId: string; publicKey: string }[]) {
    return list.filter((m) => isKeyTrusted(pins.value, m.userId, m.publicKey))
  }

  // Keyholders seal the current group key for members who don't have it yet.
  async function reconcileKeys(missing: { userId: string; publicKey: string }[]): Promise<void> {
    const ck = currentKey.value
    const targets = trustedTargets(missing)
    if (!ck || targets.length === 0) return
    const wraps = await Promise.all(
      targets.map(async (m) => ({ userId: m.userId, wrappedKey: await sealGroupKey(ck, m.publicKey) })),
    )
    await $fetch(`/api/leagues/${lid()}/chat/keys`, { method: 'POST', body: { epoch: epoch.value, wraps } }).catch(() => {})
  }

  // A keyholder, nudged that someone is missing the key, re-fetches the roster and
  // seals the current key for whoever still lacks it. No-op without a key in hand.
  async function reconcileMissing(): Promise<void> {
    if (!currentKey.value) return
    try {
      const status = await $fetch<ChatStatus>(`/api/leagues/${lid()}/chat`)
      await reconcileKeys(status.missingKeys)
    } catch {
      // transient: a later message/reconnect reconciles
    }
  }

  // We have no current key: ask the league's connected keyholders to seal it for
  // us. Best-effort and self-limiting (one request in flight); if nobody is online
  // it's a no-op and a keyholder will seal on their next load, pushing keys-added.
  let rekeyInFlight = false
  async function requestRekey(): Promise<void> {
    if (rekeyInFlight) return
    rekeyInFlight = true
    try {
      await $fetch(`/api/leagues/${lid()}/chat/request-key`, { method: 'POST' })
    } catch {
      // best effort
    } finally {
      rekeyInFlight = false
    }
  }

  async function load(): Promise<void> {
    if (!import.meta.client) return
    // No league resolved yet (e.g. the global dock on a page with no selection):
    // nothing to load, present as "off" without hitting the API.
    if (!lid()) {
      enabled.value = false
      keys.value = new Map()
      messages.value = []
      return
    }
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
      // Still keyless after loading: nudge connected keyholders to seal it for us.
      if (!currentKey.value) void requestRekey()
    } finally {
      loading.value = false
    }
  }

  async function send(text: string, parentId?: string | null): Promise<void> {
    const body = text.trim()
    const ck = currentKey.value
    if (!body || !ck || sending.value) return
    sending.value = true
    try {
      const ciphertext = await encryptMessage(body, ck)
      const { message } = await $fetch<{ message: ChatMessageDTO }>(`/api/leagues/${lid()}/chat/messages`, {
        method: 'POST',
        body: { matchId: mid(), parentId: parentId ?? null, ciphertext, epoch: epoch.value },
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

  function patchMessage(id: string, patch: Partial<DecryptedMessage>): void {
    messages.value = messages.value.map((m) => (m.id === id ? { ...m, ...patch } : m))
  }

  // Toggle the caller's emoji reaction on a message (tap the active one to clear).
  // Optimistic: adjust counts locally, then PUT; the server pushes authoritative
  // totals (chat:reaction) to everyone, which corrects our optimistic guess.
  async function react(messageId: string, emoji: ReactionEmoji): Promise<void> {
    const msg = messages.value.find((m) => m.id === messageId)
    if (!msg) return
    const prev = msg.myReaction
    const next: ReactionEmoji | null = prev === emoji ? null : emoji
    const reactions = { ...msg.reactions }
    if (prev) reactions[prev] = Math.max(0, reactions[prev] - 1)
    if (next) reactions[next] = reactions[next] + 1
    patchMessage(messageId, { reactions, myReaction: next })
    try {
      await $fetch(`/api/leagues/${lid()}/chat/react`, { method: 'PUT', body: { messageId, emoji: next } })
    } catch {
      await loadMessages()
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
        trustedTargets(fresh.memberKeys).map(async (m) => ({ userId: m.userId, wrappedKey: await sealGroupKey(gk, m.publicKey) })),
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
      trustedTargets(fresh.memberKeys).map(async (m) => ({ userId: m.userId, wrappedKey: await sealGroupKey(gk, m.publicKey) })),
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
      if (!msg.type || msg.leagueId !== lid()) return
      // A member is missing the current key (league-scoped, not per-room): if we
      // hold it, seal it for whoever still needs it. Non-keyholders no-op.
      if (msg.type === 'chat:rekey-request') {
        void reconcileMissing()
        return
      }
      // A keyholder sealed a key for some member: if we're the one still waiting,
      // reload to open our fresh wrap (clears the awaiting-key state live).
      if (msg.type === 'chat:keys-added') {
        if (!currentKey.value) void load()
        return
      }
      // Chat was turned on/off or re-keyed by an admin: reload so the change (the
      // dock appearing/disappearing, a fresh key epoch) reflects without a refresh.
      if (msg.type === 'chat:state-changed') {
        void load()
        return
      }
      // A message's reaction counts changed: patch its totals in place (our own
      // myReaction is kept - the push only carries the shared per-emoji counts).
      if (msg.type === 'chat:reaction') {
        const rm = data as { messageId?: string; totals?: ReactionTotals }
        if (rm.messageId && rm.totals) patchMessage(rm.messageId, { reactions: rm.totals })
        return
      }
      if (msg.type !== 'chat:new' || !msg.message) return
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
    awaitingKey,
    loading,
    sending,
    messages: visibleMessages,
    memberKeys,
    muted,
    toggleMute,
    identityStatus,
    load,
    send,
    react,
    enableChat,
    disableChat,
    rotateKey,
    requestRekey,
  }
}
