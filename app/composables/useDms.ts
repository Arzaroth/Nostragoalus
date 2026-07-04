import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { decryptMessage, encryptMessage, generateGroupKey, openGroupKey, sealGroupKey } from '~/utils/e2ee'
import type { DmMessageDTO, DmRecipientDTO, DmThreadDetailDTO, DmThreadSummaryDTO } from '#shared/types/dm'

// Client engine for direct messages: the same end-to-end crypto as league chat
// (~/utils/e2ee) applied to a two-party thread. The thread key is sealed to both
// participants' public keys; this composable unwraps it with the local chat
// identity, decrypts the ciphertext for display, and encrypts on send. The server
// only ever moves ciphertext. Decrypted text is held client-side, never persisted.

// One decrypted DM as the UI renders it. `text` is null when decryption failed
// (a missing key epoch) so the bubble can show a placeholder instead of blank.
export interface DecodedDm {
  id: string
  userId: string | null
  parentId: string | null
  epoch: number
  text: string | null
  createdAt: string
  editedAt: string | null
  mine: boolean
}

// Module-level so every mount of the dock shares one set of thread keys, decrypted
// message lists and a single live socket (the server pushes dm:* to this user's
// sockets by the identity pinned at connect - no per-thread subscribe needed).
const threadKeys = new Map<string, Map<number, Uint8Array>>()
const threadOther = new Map<string, DmThreadDetailDTO['other']>()
const messages = reactive(new Map<string, DecodedDm[]>())

export function useDms() {
  const queryClient = useQueryClient()
  const { identity, ensure, status } = useChatIdentity()
  const { session } = useAuth()
  const myId = computed(() => session.value?.data?.user?.id ?? null)

  const threads = useQuery({
    queryKey: ['dm', 'threads'],
    queryFn: async (): Promise<DmThreadSummaryDTO[]> => {
      const res = await $fetch<{ threads: DmThreadSummaryDTO[] }>('/api/dm/threads')
      return res.threads
    },
  })

  const totalUnread = computed(() => (threads.data.value ?? []).reduce((n, t) => n + t.unread, 0))

  // Unwrap and cache the caller's sealed key for each epoch of a thread, plus the
  // other participant. Idempotent: only fetches detail the first time per thread.
  async function ensureThreadKeys(threadId: string): Promise<Map<number, Uint8Array>> {
    const cached = threadKeys.get(threadId)
    if (cached) return cached
    await ensure()
    if (!identity.value) throw new Error('chat identity not ready')
    const res = await $fetch<{ thread: DmThreadDetailDTO }>(`/api/dm/${threadId}`)
    threadOther.set(threadId, res.thread.other)
    const map = new Map<number, Uint8Array>()
    for (const k of res.thread.myWrappedKeys) {
      try {
        map.set(k.epoch, await openGroupKey(k.wrappedKey, identity.value))
      } catch {
        // A key we cannot unwrap (wrong device / corrupt) is skipped; its messages
        // render as undecryptable rather than failing the whole thread.
      }
    }
    threadKeys.set(threadId, map)
    return map
  }

  function currentEpoch(threadId: string): number {
    const keys = threadKeys.get(threadId)
    if (!keys || keys.size === 0) return 1
    return Math.max(...keys.keys())
  }

  async function decrypt(threadId: string, dto: DmMessageDTO): Promise<DecodedDm> {
    const key = threadKeys.get(threadId)?.get(dto.epoch)
    let text: string | null = null
    if (key) {
      try {
        text = await decryptMessage(dto.ciphertext, key)
      } catch {
        text = null
      }
    }
    return {
      id: dto.id,
      userId: dto.userId,
      parentId: dto.parentId,
      epoch: dto.epoch,
      text,
      createdAt: dto.createdAt,
      editedAt: dto.editedAt,
      mine: dto.userId === myId.value,
    }
  }

  // Load (and decrypt) a thread's history into the shared reactive list, oldest
  // first for display. Also opens the live socket so new messages append.
  async function loadThread(threadId: string): Promise<void> {
    await ensureThreadKeys(threadId)
    const res = await $fetch<{ messages: DmMessageDTO[] }>(`/api/dm/${threadId}/messages`)
    const decoded = await Promise.all(res.messages.map((m) => decrypt(threadId, m)))
    // The API returns newest-first; the UI reads top-down oldest-first.
    messages.set(threadId, decoded.reverse())
  }

  function threadMessages(threadId: string): DecodedDm[] {
    return messages.get(threadId) ?? []
  }

  function otherOf(threadId: string): DmThreadDetailDTO['other'] | null {
    return threadOther.get(threadId) ?? null
  }

  const send = useMutation({
    mutationFn: async (vars: { threadId: string; text: string }): Promise<void> => {
      const keys = await ensureThreadKeys(vars.threadId)
      const epoch = currentEpoch(vars.threadId)
      const key = keys.get(epoch)
      if (!key) throw new Error('no key for this conversation')
      const ciphertext = await encryptMessage(vars.text, key)
      const res = await $fetch<{ message: DmMessageDTO }>(`/api/dm/${vars.threadId}/messages`, {
        method: 'POST',
        body: { ciphertext, epoch },
      })
      // Append our own message now; the WS echo is de-duped by id below.
      appendDecoded(vars.threadId, await decrypt(vars.threadId, res.message))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dm', 'threads'] }),
  })

  const edit = useMutation({
    mutationFn: async (vars: { threadId: string; messageId: string; text: string }): Promise<void> => {
      const keys = await ensureThreadKeys(vars.threadId)
      const epoch = currentEpoch(vars.threadId)
      const key = keys.get(epoch)
      if (!key) throw new Error('no key for this conversation')
      const ciphertext = await encryptMessage(vars.text, key)
      const res = await $fetch<{ editedAt: string }>(`/api/dm/${vars.threadId}/edit`, {
        method: 'POST',
        body: { messageId: vars.messageId, ciphertext },
      })
      const list = messages.get(vars.threadId)
      const idx = list?.findIndex((m) => m.id === vars.messageId) ?? -1
      if (list && idx >= 0) list[idx] = { ...list[idx], text: vars.text, epoch, editedAt: res.editedAt }
    },
  })

  // Open a thread with a recipient: fetch their public key, generate a fresh thread
  // key, seal it to both of us, and post it. Idempotent server-side, so re-opening
  // an existing conversation just returns it. Returns the thread id.
  const startThread = useMutation({
    mutationFn: async (recipientId: string): Promise<string> => {
      await ensure()
      if (!identity.value) throw new Error('chat identity not ready')
      const { identity: recipient } = await $fetch<{ identity: { userId: string; publicKey: string } }>('/api/dm/identity', {
        query: { userId: recipientId },
      })
      const groupKey = await generateGroupKey()
      const wraps = [
        { userId: myId.value as string, wrappedKey: await sealGroupKey(groupKey, identity.value.publicKey) },
        { userId: recipient.userId, wrappedKey: await sealGroupKey(groupKey, recipient.publicKey) },
      ]
      const res = await $fetch<{ threadId: string; epoch: number }>('/api/dm/threads', {
        method: 'POST',
        body: { recipientId, wraps },
      })
      // Cache the key immediately so the first send needs no round trip. On an
      // existing thread the server ignored our wraps, but the key we hold still
      // matches (it is the same thread key, sealed to us before).
      if (!threadKeys.has(res.threadId)) threadKeys.set(res.threadId, new Map([[res.epoch, groupKey]]))
      return res.threadId
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dm', 'threads'] }),
  })

  async function searchRecipients(q: string): Promise<DmRecipientDTO[]> {
    const res = await $fetch<{ recipients: DmRecipientDTO[] }>('/api/dm/recipients', { query: { q } })
    return res.recipients
  }

  const markRead = useMutation({
    mutationFn: async (threadId: string): Promise<void> => {
      await $fetch(`/api/dm/${threadId}/read`, { method: 'POST' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dm', 'threads'] }),
  })

  function appendDecoded(threadId: string, msg: DecodedDm): void {
    const list = messages.get(threadId)
    if (!list) {
      messages.set(threadId, [msg])
      return
    }
    if (list.some((m) => m.id === msg.id)) return
    list.push(msg)
  }

  // A single live socket for DMs, opened during setup so its onMounted connect
  // actually fires (useReconnectingSocket binds lifecycle hooks). The server
  // delivers dm:new / dm:edit to this user's sockets directly (identity pinned at
  // connect), so there is nothing to subscribe to; we just react.
  useReconnectingSocket({
    onMessage: async (data) => {
      const msg = data as { type?: string; threadId?: string; message?: DmMessageDTO; messageId?: string; ciphertext?: string; editedAt?: string }
      if (msg.type === 'dm:new' && msg.threadId && msg.message) {
        if (threadKeys.has(msg.threadId)) appendDecoded(msg.threadId, await decrypt(msg.threadId, msg.message))
        queryClient.invalidateQueries({ queryKey: ['dm', 'threads'] })
        return
      }
      if (msg.type === 'dm:edit' && msg.threadId && msg.messageId && msg.ciphertext) {
        const list = messages.get(msg.threadId)
        const idx = list?.findIndex((m) => m.id === msg.messageId) ?? -1
        if (list && idx >= 0) {
          const key = threadKeys.get(msg.threadId)?.get(list[idx].epoch)
          let text = list[idx].text
          if (key) {
            try {
              text = await decryptMessage(msg.ciphertext, key)
            } catch {
              /* keep prior text */
            }
          }
          list[idx] = { ...list[idx], text, editedAt: msg.editedAt ?? list[idx].editedAt }
        }
      }
    },
  })

  return {
    threads,
    totalUnread,
    identityStatus: status,
    ensureIdentity: ensure,
    loadThread,
    threadMessages,
    otherOf,
    send,
    edit,
    startThread,
    searchRecipients,
    markRead,
  }
}
