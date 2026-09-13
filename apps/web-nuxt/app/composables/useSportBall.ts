import { scoreIcon } from '../utils/match-view'

// The ball of the sport being played. A football beside a rugby try is the tell
// that a view never asked which sport it was showing, and four surfaces need the
// same answer - see scoreIcon for how the glyph is chosen.
export function useSportBall() {
  const sport = useSelectedSport()
  return computed(() => scoreIcon(sport.value, null))
}
