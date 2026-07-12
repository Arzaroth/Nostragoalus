import { useStorage } from '@vueuse/core'
import {
  decryptBytes,
  decryptMessage,
  encryptBytes,
  encryptMessage,
  openGroupKey,
  sealGroupKey,
} from '~/utils/e2ee'
import { chatKeyPins, isKeyTrusted } from '~/composables/useChatKeyPins'
import { emptyReactionTotals, type ReactionEmoji, type ReactionTotals } from '#shared/reactions'
import type { ChatAttachmentDTO, ChatMediaItemDTO, ChatMessageDTO, ChatModerationState } from '#shared/types/chat'
import type { DmThreadDetailDTO } from '#shared/types/dm'
import type { DecryptedMessage, PendingImage, ReportedMessage } from '~/composables/useLeagueChat'

// A single DM thread as a chat "room", exposing the SAME surface as useLeagueChat
// so ChatPanel drives either. The message stack (reactions, replies, threads,
// edits, images) is the same server code past scope resolution; here we just point
// at /api/dm/${threadId}/* and unwrap the per-thread key (the leagueChatKey model
// for two members) instead of a league group key. League-only operations
// (enable/disable/rotate/rekey/roster/moderation/typing) are inert for a DM.
export function useDmRoom(threadId: MaybeRefOrGetter<string>) {
  const { identity, ensure, status: identityStatus } = useChatIdentity()
  const { session } = useAuth()
  const myId = computed(() => session.value?.data?.user?.id ?? null)
  const myName = computed(() => session.value?.data?.user?.name ?? '')
  const myImage = computed(() => session.value?.data?.user?.image ?? null)

  // A DM thread is always "on"; ready waits on holding the current key.
  const enabled = ref(true)
  const epoch = ref(1)
  const role = ref<'MEMBER'>('MEMBER')
  const keys = ref<Map<number, Uint8Array>>(new Map())
  const messages = ref<DecryptedMessage[]>([])
  // Same roster shape as league chat, plus the avatar the DM view renders from
  // (there is no league-detail query to draw member images from in a DM).
  const memberKeys = ref<{ userId: string; publicKey: string; name: string; image: string | null }[]>([])
  const loading = ref(false)
  const sending = ref(false)
  const readMarker = ref<string | null>(null)
  const threadParentId = ref<string | null>(null)
  const threadMessages = ref<DecryptedMessage[]>([])
  const threadLoading = ref(false)

  const isAdmin = computed(() => false)
  const currentKey = computed<Uint8Array | null>(() => keys.value.get(epoch.value) ?? null)
  const ready = computed(() => !!currentKey.value)
  const awaitingKey = computed(() => !loading.value && !currentKey.value && identityStatus.value !== 'needs-restore')

  const muted = useStorage<string[]>('ng-chat-muted', [])
  const visibleMessages = computed(() => messages.value.filter((m) => !m.userId || !muted.value.includes(m.userId)))
  function toggleMute(userId: string) {
    const set = new Set(muted.value)
    set.has(userId) ? set.delete(userId) : set.add(userId)
    muted.value = [...set]
  }

  function tid(): string {
    return toValue(threadId)
  }

  // The other participant, and whether they lack a sealed key at the current epoch
  // (typically because they reset their identity). If I am the keyholder I re-seal the
  // thread key to their new public key - see reconcilePeerKey.
  const pins = chatKeyPins()
  const otherId = ref<string | null>(null)
  const otherPublicKey = ref<string | null>(null)
  const otherMissingKey = ref(false)

  // Re-seal the current thread key to the other participant after they reset their
  // identity (their old sealed copy was purged, so the thread went dark for them). Only
  // if I hold the key AND I trust their key - unseen (TOFU) or acknowledged in the
  // verify panel - so an unacknowledged key swap is never handed the thread key. Idle
  // unless they are actually missing it; re-runs when a pin changes (an acknowledge).
  async function reconcilePeerKey(): Promise<void> {
    const ck = currentKey.value
    if (!ck || !otherMissingKey.value || !otherId.value || !otherPublicKey.value) return
    if (!isKeyTrusted(pins.value, otherId.value, otherPublicKey.value)) return
    const wrappedKey = await sealGroupKey(ck, otherPublicKey.value)
    try {
      await $fetch(`/api/dm/${tid()}/keys`, {
        method: 'POST',
        body: { targetUserId: otherId.value, epoch: epoch.value, wrappedKey },
      })
      otherMissingKey.value = false
    } catch {
      // Re-seal failed (network, or a stale-epoch 409 from a concurrent change):
      // leave otherMissingKey true so a later load/reconnect retries. Clearing it
      // here would record a failed re-seal as done and leave the peer keyless until
      // a full reload.
    }
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
      matchId: null,
      parentId: r.parentId ?? null,
      threadId: r.threadId ?? null,
      text,
      createdAt: r.createdAt,
      editedAt: r.editedAt ?? null,
      attachments: r.attachments ?? [],
      moderation: r.moderation ?? 'VISIBLE',
      reported: false,
      reactions: r.reactions ?? emptyReactionTotals(),
      myReaction: r.myReaction ?? null,
      threadCount: r.threadCount ?? 0,
    }
  }

  const PAGE = 50
  const hasMore = ref(false)
  const loadingOlder = ref(false)

  async function loadMessages(opts: { resetMarker?: boolean } = {}): Promise<void> {
    const { messages: rows, readMarker: marker } = await $fetch<{ messages: ChatMessageDTO[]; readMarker: string | null }>(
      `/api/dm/${tid()}/messages`,
    )
    hasMore.value = rows.length >= PAGE
    messages.value = await Promise.all([...rows].reverse().map(decryptRow))
    if (opts.resetMarker) readMarker.value = marker
  }

  // (Re)load the thread: unwrap the caller's key for every epoch, note the two
  // participants as the "roster", then load + decrypt the history.
  async function load(opts: { background?: boolean } = {}): Promise<void> {
    const bg = opts.background ?? false
    if (!bg) loading.value = true
    try {
      await ensure()
      if (!identity.value) return
      const { thread } = await $fetch<{ thread: DmThreadDetailDTO }>(`/api/dm/${tid()}`)
      epoch.value = thread.epoch
      const map = new Map<number, Uint8Array>()
      for (const k of thread.myWrappedKeys) {
        try {
          map.set(k.epoch, await openGroupKey(k.wrappedKey, identity.value))
        } catch {
          // a key we cannot unwrap on this device is skipped; its messages read as undecryptable
        }
      }
      keys.value = map
      memberKeys.value = [
        { userId: myId.value ?? '', publicKey: identity.value.publicKey, name: myName.value, image: myImage.value },
        { userId: thread.other.userId, publicKey: thread.other.publicKey, name: thread.other.name, image: thread.other.image },
      ]
      otherId.value = thread.other.userId
      otherPublicKey.value = thread.other.publicKey
      otherMissingKey.value = thread.otherMissingCurrentKey
      await loadMessages({ resetMarker: !bg })
      // If the other party reset and I hold the key, re-seal it to their new pubkey.
      await reconcilePeerKey()
    } finally {
      if (!bg) loading.value = false
    }
  }

  async function loadOlder(): Promise<void> {
    if (loadingOlder.value || !hasMore.value || messages.value.length === 0) return
    loadingOlder.value = true
    try {
      const oldest = messages.value[0]
      const { messages: rows } = await $fetch<{ messages: ChatMessageDTO[] }>(`/api/dm/${tid()}/messages`, {
        query: { before: oldest.createdAt, beforeId: oldest.id },
      })
      hasMore.value = rows.length >= PAGE
      const older = await Promise.all([...rows].reverse().map(decryptRow))
      messages.value = [...older, ...messages.value]
    } finally {
      loadingOlder.value = false
    }
  }

  async function send(
    text: string,
    opts: { parentId?: string | null; threadId?: string | null; images?: PendingImage[]; mentions?: string[] } = {},
  ): Promise<void> {
    const body = text.trim()
    const images = opts.images ?? []
    const ck = currentKey.value
    if ((!body && images.length === 0) || !ck || sending.value) return
    sending.value = true
    try {
      const [ciphertext, imageCts] = await Promise.all([
        encryptMessage(body, ck),
        Promise.all(images.map((img) => encryptBytes(img.bytes, ck))),
      ])
      const { message } = await $fetch<{ message: ChatMessageDTO }>(`/api/dm/${tid()}/messages`, {
        method: 'POST',
        body: {
          parentId: opts.parentId ?? null,
          threadId: opts.threadId ?? null,
          ciphertext,
          epoch: epoch.value,
          images: images.map((img, i) => ({ ciphertext: imageCts[i], byteSize: img.byteSize })),
        },
      })
      if (message) {
        const dec = await decryptRow(message)
        if (opts.threadId) {
          if (!threadMessages.value.some((m) => m.id === message.id)) {
            threadMessages.value = [...threadMessages.value, dec]
          }
        } else if (!messages.value.some((m) => m.id === message.id)) {
          messages.value = [...messages.value, dec]
        }
      }
    } finally {
      sending.value = false
    }
  }

  function patchMessage(id: string, patch: Partial<DecryptedMessage>): void {
    messages.value = messages.value.map((m) => (m.id === id ? { ...m, ...patch } : m))
    threadMessages.value = threadMessages.value.map((m) => (m.id === id ? { ...m, ...patch } : m))
  }
  function bumpThreadCount(rootId: string, delta: number): void {
    const m = messages.value.find((x) => x.id === rootId)
    if (m) patchMessage(rootId, { threadCount: Math.max(0, m.threadCount + delta) })
  }

  async function openThread(rootId: string): Promise<void> {
    threadParentId.value = rootId
    threadMessages.value = []
    threadLoading.value = true
    try {
      const { messages: rows } = await $fetch<{ messages: ChatMessageDTO[] }>(`/api/dm/${tid()}/messages`, {
        query: { thread: rootId },
      })
      const decrypted = await Promise.all(rows.map(decryptRow))
      if (threadParentId.value !== rootId) return
      threadMessages.value = decrypted
    } finally {
      if (threadParentId.value === rootId) threadLoading.value = false
    }
  }
  function closeThread(): void {
    threadParentId.value = null
    threadMessages.value = []
  }

  async function editMessage(
    messageId: string,
    text: string,
    opts: { addImages?: PendingImage[]; removeIdxs?: number[] } = {},
  ): Promise<void> {
    const body = text.trim()
    const addImages = opts.addImages ?? []
    const removeIdxs = opts.removeIdxs ?? []
    const ck = currentKey.value
    if (!ck) return
    const msg = messages.value.find((m) => m.id === messageId) ?? threadMessages.value.find((m) => m.id === messageId)
    const keptCount = (msg ? msg.attachments.filter((a) => !removeIdxs.includes(a.idx)).length : 0) + addImages.length
    if (!body && keptCount === 0) return
    const [ciphertext, addCts] = await Promise.all([
      encryptMessage(body, ck),
      Promise.all(addImages.map((img) => encryptBytes(img.bytes, ck))),
    ])
    const { editedAt, attachments } = await $fetch<{ editedAt: string; attachments: ChatAttachmentDTO[] }>(
      `/api/dm/${tid()}/edit`,
      {
        method: 'POST',
        body: {
          messageId,
          ciphertext,
          addImages: addImages.map((img, i) => ({ ciphertext: addCts[i], byteSize: img.byteSize })),
          removeIdxs,
        },
      },
    )
    patchMessage(messageId, { text: body, editedAt, attachments })
  }

  async function roomMedia(): Promise<ChatMediaItemDTO[]> {
    try {
      const { media } = await $fetch<{ media: ChatMediaItemDTO[] }>(`/api/dm/${tid()}/media`)
      return media
    } catch {
      return []
    }
  }

  async function loadAttachment(messageId: string, idx = 0, hintEpoch?: number): Promise<Uint8Array | null> {
    try {
      const { ciphertext, epoch: serverEpoch } = await $fetch<{ ciphertext: string; epoch: number }>(
        `/api/dm/${tid()}/attachments/${messageId}`,
        { query: { idx } },
      )
      const tryEpochs = [hintEpoch ?? serverEpoch, ...keys.value.keys()]
      const seen = new Set<number>()
      for (const ep of tryEpochs) {
        if (seen.has(ep)) continue
        seen.add(ep)
        const key = keys.value.get(ep)
        if (!key) continue
        try {
          return await decryptBytes(ciphertext, key)
        } catch {
          // wrong key for this epoch - try the next
        }
      }
      return null
    } catch {
      return null
    }
  }

  async function react(messageId: string, emoji: ReactionEmoji): Promise<void> {
    const msg = messages.value.find((m) => m.id === messageId) ?? threadMessages.value.find((m) => m.id === messageId)
    if (!msg) return
    const prev = msg.myReaction
    const next: ReactionEmoji | null = prev === emoji ? null : emoji
    const reactions = { ...msg.reactions }
    if (prev) reactions[prev] = Math.max(0, reactions[prev] - 1)
    if (next) reactions[next] = reactions[next] + 1
    patchMessage(messageId, { reactions, myReaction: next })
    try {
      await $fetch(`/api/dm/${tid()}/react`, { method: 'PUT', body: { messageId, emoji: next } })
    } catch {
      await loadMessages()
    }
  }

  // League-only operations have no meaning in a two-person DM; they are inert so
  // ChatPanel can call the same surface. ChatPanel also hides their UI in DM mode.
  async function noop(): Promise<void> {}
  async function report(): Promise<void> {}
  async function moderate(): Promise<void> {}
  async function fetchReports(): Promise<ReportedMessage[]> {
    return []
  }
  const typingUserIds = ref<string[]>([])
  function sendTyping(): void {}

  useReconnectingSocket({
    onOpen: () => {
      void load({ background: true })
    },
    onMessage: (data) => {
      const msg = data as {
        type?: string
        threadId?: string
        message?: ChatMessageDTO
        messageId?: string
        ciphertext?: string
        editedAt?: string
        attachments?: ChatAttachmentDTO[]
        totals?: ReactionTotals
      }
      if (!msg.type || msg.threadId !== tid()) return
      if (msg.type === 'dm:reaction') {
        if (msg.messageId && msg.totals) patchMessage(msg.messageId, { reactions: msg.totals })
        return
      }
      if (msg.type === 'dm:edit') {
        if (msg.messageId && msg.ciphertext) {
          const key = currentKey.value
          const ciphertext = msg.ciphertext
          const messageId = msg.messageId
          void (async () => {
            let text: string | null = null
            if (key) {
              try {
                text = await decryptMessage(ciphertext, key)
              } catch {
                text = null
              }
            }
            const patch: Partial<DecryptedMessage> = { text, editedAt: msg.editedAt ?? null }
            if (msg.attachments) patch.attachments = msg.attachments
            patchMessage(messageId, patch)
          })()
        }
        return
      }
      if (msg.type !== 'dm:new' || !msg.message) return
      const incoming = msg.message
      if (incoming.threadId) {
        bumpThreadCount(incoming.threadId, 1)
        if (threadParentId.value === incoming.threadId && !threadMessages.value.some((m) => m.id === incoming.id)) {
          void decryptRow(incoming).then((m) => {
            threadMessages.value = [...threadMessages.value, m]
          })
        }
        return
      }
      if (messages.value.some((m) => m.id === incoming.id)) return
      void decryptRow(incoming).then((m) => {
        messages.value = [...messages.value, m]
      })
    },
  })

  watch(
    () => toValue(threadId),
    () => {
      closeThread()
      void load()
    },
    { immediate: true },
  )

  // Acknowledging the peer's changed key (in the verify panel) updates the shared pin
  // store; that is our cue to re-seal the thread key to their new identity.
  // Shallow watch: the pin store is always replaced wholesale on an acknowledge
  // (never mutated in place), so a shallow watch fires on every change and avoids a
  // deep diff on every app-wide pin write.
  watch(pins, () => void reconcilePeerKey())

  const visibleThread = computed(() =>
    threadMessages.value.filter((m) => !m.userId || !muted.value.includes(m.userId)),
  )

  return {
    enabled,
    epoch,
    role,
    isAdmin,
    ready,
    awaitingKey,
    loading,
    sending,
    readMarker,
    hasMore,
    loadingOlder,
    loadOlder,
    typingUserIds,
    sendTyping,
    messages: visibleMessages,
    memberKeys,
    muted,
    toggleMute,
    identityStatus,
    load,
    send,
    editMessage,
    roomMedia,
    loadAttachment,
    react,
    report,
    moderate,
    fetchReports,
    enableChat: noop,
    disableChat: noop,
    rotateKey: noop,
    requestRekey: noop,
    threadParentId,
    threadMessages: visibleThread,
    threadLoading,
    openThread,
    closeThread,
  }
}
