import type { OddsTriple } from '#shared/types/odds'
import { showOddsEnabled } from '../utils/prefs'

// The "show bookmaker odds" preference alone (default ON) - for pages that
// already have their odds data (MatchListItem.odds, the match detail payload)
// and must not drag the whole match-list query in just for a boolean.
export function useOddsPreference() {
  const { session } = useAuth()
  return computed(() => showOddsEnabled(session.value?.data?.user))
}

// Preference + per-match odds for components that only know a matchId
// (PredictionList rows). Subscribes to the match-list query.
export function useMatchOdds() {
  const enabled = useOddsPreference()

  const { data: matches } = useMatches()
  const byMatch = computed<Record<string, OddsTriple>>(() => {
    const map: Record<string, OddsTriple> = {}
    for (const m of matches.value ?? []) {
      if (m.odds) map[m.id] = { home: m.odds.home, draw: m.odds.draw, away: m.odds.away }
    }
    return map
  })

  return { enabled, byMatch }
}
