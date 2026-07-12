// A one-slot hand-off asking the messaging dock to open a direct-message thread
// with a given user (e.g. the "Message" button on a profile page). App-level
// singleton so the requester and the dock share one slot even if the dock mounts
// later. The dock opens/starts the thread; the requester only names the target.
export function useDmOpen() {
  const app = useNuxtApp() as {
    _ngDmOpen?: { pending: Ref<string | null>; requestOpen: Ref<number> }
  }
  app._ngDmOpen ??= { pending: ref<string | null>(null), requestOpen: ref(0) }
  const { pending, requestOpen } = app._ngDmOpen

  // Ask the dock to open (or start) a DM with this user id.
  function requestDm(userId: string): void {
    pending.value = userId
    requestOpen.value++
  }
  // The dock consumes the slot (returns and clears it).
  function take(): string | null {
    const v = pending.value
    pending.value = null
    return v
  }
  return { pending, requestOpen, requestDm, take }
}
