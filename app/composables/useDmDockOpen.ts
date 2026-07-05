// A one-slot hand-off asking the messaging dock to open Direct mode in place, at
// a specific thread or the conversation inbox (the DM bell entry click). Unlike
// useDmOpen (which starts a thread with a *user*), this targets an existing
// thread by id, or the inbox when a grouped notification spans several. In-app it
// beats routing to /?dm=... : the dock is already mounted, so a same-route query
// change would never re-fire its deep-link handler and the click would just land
// on the current page. App-level singleton so bell and dock share one slot.
export interface DmDockRequest {
  threadId: string | null
}

export function useDmDockOpen() {
  const app = useNuxtApp() as {
    _ngDmDockOpen?: { pending: Ref<DmDockRequest | null>; requestOpen: Ref<number> }
  }
  app._ngDmDockOpen ??= { pending: ref<DmDockRequest | null>(null), requestOpen: ref(0) }
  const { pending, requestOpen } = app._ngDmDockOpen

  // Open the dock on this conversation.
  function requestThread(threadId: string): void {
    pending.value = { threadId }
    requestOpen.value++
  }
  // Open the dock on the conversation list (several unread threads).
  function requestInbox(): void {
    pending.value = { threadId: null }
    requestOpen.value++
  }
  // The dock consumes the slot (returns and clears it).
  function take(): DmDockRequest | null {
    const v = pending.value
    pending.value = null
    return v
  }
  return { pending, requestOpen, requestThread, requestInbox, take }
}
