// A one-slot hand-off asking the floating chat dock to open to a given room
// scope. Used by the chat-mention deep link (a push/bell click) once the
// ng-league cookie has been pointed at the target league. App-level singleton so
// the route-level deep-link plugin and the dock share one slot even if the dock
// mounts after the request fires.
export type ChatOpenScope = 'global' | 'match'

export function useChatDockOpen() {
  const app = useNuxtApp() as {
    _ngChatDockOpen?: { pending: Ref<ChatOpenScope | null>; requestOpen: Ref<number> }
  }
  app._ngChatDockOpen ??= { pending: ref<ChatOpenScope | null>(null), requestOpen: ref(0) }
  const { pending, requestOpen } = app._ngChatDockOpen

  // Ask the dock to open to this scope.
  function requestOpenRoom(scope: ChatOpenScope): void {
    pending.value = scope
    requestOpen.value++
  }
  // The dock consumes the slot (returns and clears it).
  function take(): ChatOpenScope | null {
    const v = pending.value
    pending.value = null
    return v
  }
  return { pending, requestOpen, requestOpenRoom, take }
}
