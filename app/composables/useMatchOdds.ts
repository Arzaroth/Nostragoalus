import { showOddsEnabled } from '../utils/prefs'
import type { MatchListItem } from './useMatches'

// The full odds payload a match row carries: current 1X2 plus opening prices
// and any per-bookmaker breakdown.
export type MatchOddsItem = NonNullable<MatchListItem['odds']>

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
  const byMatch = computed<Record<string, MatchOddsItem>>(() => {
    const map: Record<string, MatchOddsItem> = {}
    for (const m of matches.value ?? []) {
      if (m.odds) map[m.id] = m.odds
    }
    return map
  })

  return { enabled, byMatch }
}
