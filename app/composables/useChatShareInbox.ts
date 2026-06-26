import type { PendingImage } from '~/composables/useLeagueChat'

// A one-slot hand-off from "share a pick" to the league chat composer. The share
// button drops a pre-compressed image here and asks the dock to open; the league
// (global-room) chat panel picks it up into its buffered-image tray, so the user
// reviews and hits send like any other image - reusing the existing group-key
// encryption instead of a second keyed socket. App-level singleton so the two
// distant components share one slot.
export interface PendingShare {
  image: PendingImage
  caption: string
}

export function useChatShareInbox() {
  const app = useNuxtApp() as {
    _ngChatShareInbox?: { pending: Ref<PendingShare | null>; requestOpen: Ref<number> }
  }
  app._ngChatShareInbox ??= { pending: ref<PendingShare | null>(null), requestOpen: ref(0) }
  const { pending, requestOpen } = app._ngChatShareInbox

  // Drop an image in and ask the dock to open the global room.
  function offer(share: PendingShare): void {
    pending.value = share
    requestOpen.value++
  }
  // The chat panel consumes the slot (returns and clears it).
  function take(): PendingShare | null {
    const v = pending.value
    pending.value = null
    return v
  }
  return { pending, requestOpen, offer, take }
}
