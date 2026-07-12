import type { CallLogEntry } from '#shared/types/voice'

// Call lines for a chat room (league room or DM thread), interleaved into the
// timeline by ChatPanel. The token makes responses last-write-wins: a slow older
// fetch (a voice:log push racing a socket reopen) can never clobber a newer one,
// and a scope switch invalidates everything already in flight.
export function createCallLog(queryOf: () => Record<string, string | undefined>) {
  const callLog = ref<CallLogEntry[]>([])
  let requestToken = 0

  function resetCallLog(): void {
    requestToken += 1
    callLog.value = []
  }

  async function loadCallLog(): Promise<void> {
    const token = ++requestToken
    try {
      const res = await $fetch<{ calls: CallLogEntry[] }>('/api/voice/calls', { query: queryOf() })
      if (token === requestToken) callLog.value = res.calls ?? []
    } catch {
      // The call-line strip is optional decoration; the chat works without it.
    }
  }

  return { callLog, loadCallLog, resetCallLog }
}
