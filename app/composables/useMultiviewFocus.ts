import { isCellPresent } from '../utils/multiview'

// App-level singleton bridging the multiview page and the single ChatDock: the
// page publishes which match is focused (and which are on the grid), and the dock
// follows that focus instead of the route. Same one-slot pattern as
// useChatDockOpen, so the dock and the page share state even though the dock lives
// in the layout and the page mounts/unmounts independently.
export function useMultiviewFocus() {
  const app = useNuxtApp() as {
    _ngMultiviewFocus?: { focusedMatchId: Ref<string | null>; presentCells: Ref<string[]> }
  }
  app._ngMultiviewFocus ??= { focusedMatchId: ref<string | null>(null), presentCells: ref<string[]>([]) }
  const { focusedMatchId, presentCells } = app._ngMultiviewFocus

  function setFocus(id: string | null): void {
    focusedMatchId.value = id
  }
  function setPresent(ids: string[]): void {
    presentCells.value = ids
  }
  // Focus a match iff it is currently a grid cell; returns whether it took, so the
  // caller can fall back to navigation when the grid is absent or lacks the match.
  function tryFocus(id: string): boolean {
    if (isCellPresent(presentCells.value, id)) {
      focusedMatchId.value = id
      return true
    }
    return false
  }
  return { focusedMatchId, presentCells, setFocus, setPresent, tryFocus }
}
