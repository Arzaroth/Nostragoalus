import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { generateGroupKey, sealGroupKey } from '~/utils/e2ee'
import type { DmRecipientDTO, DmThreadSummaryDTO } from '#shared/types/dm'

// The DM inbox: the conversation list, unread counts, recipient search and opening
// a thread. The per-thread conversation itself runs through useDmRoom + ChatPanel;
// this composable is only the list side of the Direct dock. One live socket keeps
// the unread counts + ordering fresh as messages arrive in any thread.
export function useDmInbox() {
  const queryClient = useQueryClient()
  const { identity, ensure, status: identityStatus } = useChatIdentity()
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

  async function searchRecipients(q: string): Promise<DmRecipientDTO[]> {
    const res = await $fetch<{ recipients: DmRecipientDTO[] }>('/api/dm/recipients', { query: { q } })
    return res.recipients
  }

  // Open (or reopen) a thread with a recipient: fetch their public key, generate a
  // fresh thread key, seal it to both of us, post it. Idempotent server-side, so
  // reopening an existing conversation just returns it. Returns the thread id.
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
      const res = await $fetch<{ threadId: string }>('/api/dm/threads', {
        method: 'POST',
        body: { recipientId, wraps },
      })
      return res.threadId
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dm', 'threads'] }),
  })

  const markRead = useMutation({
    mutationFn: async (threadId: string): Promise<void> => {
      await $fetch(`/api/dm/${threadId}/read`, { method: 'POST' })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dm', 'threads'] }),
  })

  // A new message in any thread re-orders the inbox and bumps its unread; refetch
  // the list so the badge + ordering stay live. (The open thread itself updates
  // through useDmRoom's own socket.)
  useReconnectingSocket({
    onMessage: (data) => {
      const msg = data as { type?: string }
      if (msg.type === 'dm:new') queryClient.invalidateQueries({ queryKey: ['dm', 'threads'] })
    },
  })

  return {
    threads,
    totalUnread,
    identityStatus,
    ensureIdentity: ensure,
    searchRecipients,
    startThread,
    markRead,
  }
}
