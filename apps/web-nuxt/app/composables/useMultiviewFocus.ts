import { isCellPresent } from '../utils/multiview'

// App-level singleton bridging the multiview page and the single ChatDock: the
// page publishes which match is focused (and which are on the grid), and the dock
// follows that focus instead of the route. Same one-slot pattern as
// useChatDockOpen, so the dock and the page share state even though the dock lives
// in the layout and the page mounts/unmounts independently.
export function useMultiviewFocus() {
  const app = useNuxtApp() as {
    _ngMultiviewFocus?: {
      focusedMatchId: Ref<string | null>
      presentCells: Ref<string[]>
      requestHandler: Ref<((id: string) => void) | null>
    }
  }
  app._ngMultiviewFocus ??= {
    focusedMatchId: ref<string | null>(null),
    presentCells: ref<string[]>([]),
    requestHandler: ref<((id: string) => void) | null>(null),
  }
  const { focusedMatchId, presentCells, requestHandler } = app._ngMultiviewFocus

  function setFocus(id: string | null): void {
    focusedMatchId.value = id
  }
  function setPresent(ids: string[]): void {
    presentCells.value = ids
  }
  // The multiview page registers how a focus request reaches the URL (its single
  // source of truth); clears it on unmount. Without a handler tryFocus still
  // updates the published focus so a dock-only consumer keeps working.
  function onFocusRequest(handler: ((id: string) => void) | null): void {
    requestHandler.value = handler
  }
  // Focus a match iff it is currently a grid cell; returns whether it took, so the
  // caller can fall back to navigation when the grid is absent or lacks the match.
  // Routes through the page handler so the URL (and thus the grid highlight) moves,
  // not just the dock's thread.
  function tryFocus(id: string): boolean {
    if (isCellPresent(presentCells.value, id)) {
      focusedMatchId.value = id
      requestHandler.value?.(id)
      return true
    }
    return false
  }
  return { focusedMatchId, presentCells, setFocus, setPresent, onFocusRequest, tryFocus }
}
