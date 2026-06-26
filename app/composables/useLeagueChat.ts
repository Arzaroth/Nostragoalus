import { useStorage } from '@vueuse/core'
import {
  decryptBytes,
  decryptMessage,
  encryptBytes,
  encryptMessage,
  generateGroupKey,
  openGroupKey,
  sealGroupKey,
} from '~/utils/e2ee'
import { chatKeyPins, isKeyTrusted } from '~/composables/useChatKeyPins'
import { emptyReactionTotals, type ReactionEmoji, type ReactionTotals } from '#shared/reactions'
import type { ChatAttachmentDTO, ChatMediaItemDTO, ChatMessageDTO, ChatModerationState } from '#shared/types/chat'

// A pre-compressed image waiting to be sent (the composer buffers these before the
// user hits send, and edits append them); bytes are the webp the composable seals.
export interface PendingImage {
  bytes: Uint8Array
  byteSize: number
}

export interface DecryptedMessage {
  id: string
  userId: string | null
  matchId: string | null
  parentId: string | null
  text: string | null // null = could not decrypt (wrong/absent key)
  createdAt: string
  editedAt: string | null
  attachments: ChatAttachmentDTO[]
  moderation: ChatModerationState
  reported: boolean
  reactions: ReactionTotals
  myReaction: ReactionEmoji | null
  replyCount: number
}

export interface ReportedMessage {
  id: string
  userId: string | null
  text: string | null
  reports: number
  moderation: ChatModerationState
  createdAt: string
}

interface ChatStatus {
  enabled: boolean
  epoch: number
  role: 'OWNER' | 'MODERATOR' | 'MEMBER'
  myWrappedKeys: { epoch: number; wrappedKey: string }[]
  missingKeys: { userId: string; publicKey: string; name: string }[]
  memberKeys: { userId: string; publicKey: string; name: string }[]
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
  const memberKeys = ref<{ userId: string; publicKey: string; name: string }[]>([])
  const loading = ref(false)
  const sending = ref(false)
  // Thread view: the open thread's root message id and its decrypted replies.
  // Replies live here, never in the main `messages` list (the server keeps them
  // out of the room page); each top-level message carries a replyCount instead.
  const threadParentId = ref<string | null>(null)
  const threadMessages = ref<DecryptedMessage[]>([])
  const threadLoading = ref(false)

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
      editedAt: r.editedAt ?? null,
      attachments: r.attachments ?? [],
      moderation: r.moderation ?? 'VISIBLE',
      reported: r.reported ?? false,
      reactions: r.reactions ?? emptyReactionTotals(),
      myReaction: r.myReaction ?? null,
      replyCount: r.replyCount ?? 0,
    }
  }

  // The server pages newest-first at this size; a full page means there may be
  // older history behind it, surfaced as a "load more" control.
  const PAGE = 50
  const hasMore = ref(false)
  const loadingOlder = ref(false)

  async function loadMessages(): Promise<void> {
    const m = mid()
    const { messages: rows } = await $fetch<{ messages: ChatMessageDTO[] }>(`/api/leagues/${lid()}/chat/messages`, {
      query: m ? { matchId: m } : {},
    })
    hasMore.value = rows.length >= PAGE
    // The API returns newest-first; show oldest-first.
    messages.value = await Promise.all([...rows].reverse().map(decryptRow))
  }

  // Page backwards from the oldest loaded message, prepending the older ones.
  async function loadOlder(): Promise<void> {
    if (loadingOlder.value || !hasMore.value || messages.value.length === 0) return
    loadingOlder.value = true
    try {
      const m = mid()
      const before = messages.value[0].createdAt
      const { messages: rows } = await $fetch<{ messages: ChatMessageDTO[] }>(`/api/leagues/${lid()}/chat/messages`, {
        query: m ? { matchId: m, before } : { before },
      })
      hasMore.value = rows.length >= PAGE
      const older = await Promise.all([...rows].reverse().map(decryptRow))
      const seen = new Set(messages.value.map((x) => x.id))
      const fresh = older.filter((o) => !seen.has(o.id))
      if (fresh.length) messages.value = [...fresh, ...messages.value]
    } finally {
      loadingOlder.value = false
    }
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
      memberKeys.value = status.memberKeys
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

  // Refresh just the member roster (names + keys). Cheap, and used when a message
  // arrives from someone we don't have a name for yet (a fresh joiner): it pulls
  // their name in live so they stop showing as "Someone" without a page reload.
  async function refreshRoster(): Promise<void> {
    if (!lid()) return
    try {
      const status = await $fetch<ChatStatus>(`/api/leagues/${lid()}/chat`)
      memberKeys.value = status.memberKeys
    } catch {
      // transient: a later message/reconnect refreshes it
    }
  }

  // background = a socket reconnect / tab refocus refresh, NOT an initial open or
  // room switch. In background mode we keep the message list mounted (no loading
  // spinner) and never clear it, so the reader's scroll position survives - the
  // list is replaced atomically at the end by loadMessages. A foreground load
  // (room switch / explicit) shows the spinner and resets, as before.
  async function load(opts: { background?: boolean } = {}): Promise<void> {
    if (!import.meta.client) return
    const bg = !!opts.background
    // No league resolved yet (e.g. the global dock on a page with no selection):
    // nothing to load, present as "off" without hitting the API.
    if (!lid()) {
      enabled.value = false
      keys.value = new Map()
      messages.value = []
      return
    }
    if (!bg) loading.value = true
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
      if (!bg) {
        keys.value = new Map()
        messages.value = []
      }
      if (!status.enabled) {
        if (bg) messages.value = []
        return
      }
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
      if (!bg) loading.value = false
    }
  }

  // Send a message: an (optional) caption plus any buffered images, as one post.
  // The caption and each image are sealed under the current epoch; the blobs never
  // leave the device in the clear. A message must carry text or at least one image.
  async function send(
    text: string,
    opts: { parentId?: string | null; images?: PendingImage[]; mentions?: string[] } = {},
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
      const { message } = await $fetch<{ message: ChatMessageDTO }>(`/api/leagues/${lid()}/chat/messages`, {
        method: 'POST',
        body: {
          matchId: mid(),
          parentId: opts.parentId ?? null,
          ciphertext,
          epoch: epoch.value,
          images: images.map((img, i) => ({ ciphertext: imageCts[i], byteSize: img.byteSize })),
          // Plaintext mention ids for the unread-mention badge (see messages.post).
          mentions: opts.mentions ?? [],
        },
      })
      // Append our own message from the POST response; the WS echo (chat:new)
      // dedupes on id, so we don't depend on it to see what we just sent. A reply
      // lands in the open thread (its replyCount bump rides the echo, so it isn't
      // double-counted here); a top-level message lands in the main list.
      if (message) {
        const dec = await decryptRow(message)
        if (opts.parentId) {
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
    // Mirror into the open thread so an edit/reaction/moderation on a reply (or on
    // a parent shown in both places) reflects live wherever it is rendered.
    threadMessages.value = threadMessages.value.map((m) => (m.id === id ? { ...m, ...patch } : m))
  }
  // Adjust a parent's reply count (clamped at zero) when a reply is added/removed.
  function bumpReplyCount(parentId: string, delta: number): void {
    const m = messages.value.find((x) => x.id === parentId)
    if (m) patchMessage(parentId, { replyCount: Math.max(0, m.replyCount + delta) })
  }
  // Open a message's thread: fetch + decrypt its replies (server returns them
  // oldest-first). Close clears the view.
  async function openThread(parentId: string): Promise<void> {
    threadParentId.value = parentId
    threadLoading.value = true
    try {
      const m = mid()
      const { messages: rows } = await $fetch<{ messages: ChatMessageDTO[] }>(`/api/leagues/${lid()}/chat/messages`, {
        query: m ? { matchId: m, thread: parentId } : { thread: parentId },
      })
      threadMessages.value = await Promise.all(rows.map(decryptRow))
    } finally {
      threadLoading.value = false
    }
  }
  function closeThread(): void {
    threadParentId.value = null
    threadMessages.value = []
  }

  // The author edits their own message: re-encrypt the text under the current key,
  // optionally dropping some images (removeIdxs) and appending new ones (sealed
  // under the current epoch). Patch the text, edit time and attachment set from the
  // server's authoritative response. The message must keep text or an image.
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
    // The message must keep some content: text, a surviving image, or a new one -
    // an edit that strips everything would leave a ghost message.
    const msg = messages.value.find((m) => m.id === messageId) ?? threadMessages.value.find((m) => m.id === messageId)
    const keptCount = (msg ? msg.attachments.filter((a) => !removeIdxs.includes(a.idx)).length : 0) + addImages.length
    if (!body && keptCount === 0) return
    const [ciphertext, addCts] = await Promise.all([
      encryptMessage(body, ck),
      Promise.all(addImages.map((img) => encryptBytes(img.bytes, ck))),
    ])
    const { editedAt, attachments } = await $fetch<{ editedAt: string; attachments: ChatAttachmentDTO[] }>(
      `/api/leagues/${lid()}/chat/edit`,
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

  // Every image in this room (newest first), for the media gallery. Descriptors
  // only - the bytes are fetched per image on demand via loadAttachment.
  async function roomMedia(): Promise<ChatMediaItemDTO[]> {
    const m = mid()
    try {
      const { media } = await $fetch<{ media: ChatMediaItemDTO[] }>(`/api/leagues/${lid()}/chat/media`, {
        query: m ? { matchId: m } : {},
      })
      return media
    } catch {
      return []
    }
  }

  // Toggle the caller's report on a message (report, or withdraw it). Optimistic;
  // the server decides whether enough reports flip it to PENDING.
  async function report(messageId: string): Promise<void> {
    const found = messages.value.find((m) => m.id === messageId) ?? threadMessages.value.find((m) => m.id === messageId)
    const current = found?.reported ?? false
    const next = !current
    patchMessage(messageId, { reported: next })
    try {
      const res = await $fetch<{ state: ChatModerationState }>(`/api/leagues/${lid()}/chat/report`, {
        method: 'POST',
        body: { messageId, reported: next },
      })
      patchMessage(messageId, { moderation: res.state })
    } catch {
      patchMessage(messageId, { reported: current })
    }
  }

  // Owner/moderator: remove (tombstone) or restore a message. Patch in place so the
  // moderator's own view does not jump; a member who had the content stripped
  // refetches it when the chat:moderation push lands (see the socket handler).
  async function moderate(messageId: string, action: 'remove' | 'restore'): Promise<void> {
    const res = await $fetch<{ state: ChatModerationState }>(`/api/leagues/${lid()}/chat/moderate`, {
      method: 'POST',
      body: { messageId, action },
    })
    patchMessage(messageId, { moderation: res.state })
  }

  // The moderation queue (owner/moderator), decrypted for display.
  async function fetchReports(): Promise<ReportedMessage[]> {
    const { reports } = await $fetch<{
      reports: { id: string; userId: string | null; epoch: number; ciphertext: string; moderation: ChatModerationState; reports: number; createdAt: string }[]
    }>(`/api/leagues/${lid()}/chat/reports`)
    return Promise.all(
      reports.map(async (r) => {
        const key = keys.value.get(r.epoch)
        let text: string | null = null
        if (key) {
          try {
            text = await decryptMessage(r.ciphertext, key)
          } catch {
            text = null
          }
        }
        return { id: r.id, userId: r.userId, text, reports: r.reports, moderation: r.moderation, createdAt: r.createdAt }
      }),
    )
  }

  // Fetch and decrypt one image (message + idx), returning raw webp bytes (the
  // caller turns them into a blob URL). The hinted epoch picks the key; if that one
  // is absent or fails (a re-key, or a legacy row whose epoch was backfilled), we
  // fall back to trying every key we hold, so the image still opens. Null if it
  // can't be fetched or no key decrypts it.
  async function loadAttachment(messageId: string, idx = 0, hintEpoch?: number): Promise<Uint8Array | null> {
    try {
      const { ciphertext, epoch: serverEpoch } = await $fetch<{ ciphertext: string; epoch: number }>(
        `/api/leagues/${lid()}/chat/attachments/${messageId}`,
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
          // wrong key for this epoch - try the next one we hold
        }
      }
      return null
    } catch {
      return null
    }
  }

  // Toggle the caller's emoji reaction on a message (tap the active one to clear).
  // Optimistic: adjust counts locally, then PUT; the server pushes authoritative
  // totals (chat:reaction) to everyone, which corrects our optimistic guess.
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

  // Transient "who is typing" presence for the current room. Each ping refreshes
  // a short expiry; a sender's typing clears when their message lands.
  const typingUserIds = ref<string[]>([])
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  function clearTyping(userId: string): void {
    const tmr = typingTimers.get(userId)
    if (tmr) clearTimeout(tmr)
    typingTimers.delete(userId)
    typingUserIds.value = typingUserIds.value.filter((u) => u !== userId)
  }
  function noteTyping(userId: string): void {
    const existing = typingTimers.get(userId)
    if (existing) clearTimeout(existing)
    if (!typingUserIds.value.includes(userId)) typingUserIds.value = [...typingUserIds.value, userId]
    typingTimers.set(userId, setTimeout(() => clearTyping(userId), 5000))
  }
  let lastTypingSent = 0
  function sendTyping(): void {
    const now = Date.now()
    if (now - lastTypingSent < 3000 || !ready.value) return
    lastTypingSent = now
    socket.send({ type: 'chat:typing', leagueId: lid(), matchId: mid() })
  }
  onScopeDispose(() => {
    for (const tmr of typingTimers.values()) clearTimeout(tmr)
    typingTimers.clear()
  })

  const socket = useReconnectingSocket({
    onOpen: () => {
      // A reconnect / tab refocus: refresh in the background so the open message
      // list and the reader's scroll position are not thrown away.
      void load({ background: true })
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
      // A message was edited by its author: re-decrypt the new ciphertext (it is
      // re-encrypted under the current key) and patch the text + edit time.
      if (msg.type === 'chat:edit') {
        const em = data as { messageId?: string; ciphertext?: string; editedAt?: string; attachments?: ChatAttachmentDTO[] }
        if (em.messageId && em.ciphertext) {
          const key = currentKey.value
          void (async () => {
            let text: string | null = null
            if (key) {
              try {
                text = await decryptMessage(em.ciphertext!, key)
              } catch {
                text = null
              }
            }
            const patch: Partial<DecryptedMessage> = { text, editedAt: em.editedAt ?? null }
            if (em.attachments) patch.attachments = em.attachments
            patchMessage(em.messageId!, patch)
          })()
        }
        return
      }
      // A message was moderated: patch its state so it hides/tombstones or reveals
      // live. The render decides what to show from the state and the viewer role.
      // If it became visible but our copy had the content stripped (we were a
      // non-moderator while it was pending), refetch to get the plaintext back.
      if (msg.type === 'chat:moderation') {
        const mm = data as { messageId?: string; state?: ChatModerationState }
        if (mm.messageId && mm.state) {
          patchMessage(mm.messageId, { moderation: mm.state })
          if (mm.state === 'VISIBLE') {
            const m = messages.value.find((x) => x.id === mm.messageId)
            if (m && m.text === null && m.attachments.length === 0) void load()
          }
        }
        return
      }
      // A member is typing in this room: show the transient hint.
      if (msg.type === 'chat:typing') {
        const tm = data as { matchId?: string | null; userId?: string }
        if ((tm.matchId ?? null) === mid() && tm.userId) noteTyping(tm.userId)
        return
      }
      if (msg.type !== 'chat:new' || !msg.message) return
      if ((msg.message.matchId ?? null) !== mid()) return
      const incoming = msg.message
      // A message from someone we have no name for yet (a fresh joiner): pull the
      // roster so they stop reading as "Someone" without a reload.
      const author = incoming.userId
      if (author) clearTyping(author)
      if (author && !memberKeys.value.some((k) => k.userId === author)) void refreshRoster()
      // A reply: bump its parent's count and, if that thread is open, append it.
      // The count rides the echo (not the optimistic send) so it isn't doubled.
      if (incoming.parentId) {
        bumpReplyCount(incoming.parentId, 1)
        if (threadParentId.value === incoming.parentId && !threadMessages.value.some((m) => m.id === incoming.id)) {
          void decryptRow(incoming).then((m) => {
            threadMessages.value = [...threadMessages.value, m]
          })
        }
        return
      }
      // A top-level message: append unless we already have it (our own echo).
      if (messages.value.some((m) => m.id === incoming.id)) return
      void decryptRow(incoming).then((m) => {
        messages.value = [...messages.value, m]
      })
    },
  })

  // Switching room (or league) closes any open thread - it belonged to the room
  // we're leaving - then reloads the new room.
  watch(
    () => [toValue(leagueId), toValue(matchId)],
    () => {
      closeThread()
      void load()
    },
    { immediate: true },
  )

  // Thread replies, muted authors filtered like the main list.
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
    enableChat,
    disableChat,
    rotateKey,
    requestRekey,
    threadParentId,
    threadMessages: visibleThread,
    threadLoading,
    openThread,
    closeThread,
  }
}
