type OddsTriple = { home: number; draw: number; away: number }

// The "show bookmaker odds" preference (default ON) + per-match odds for
// components that only know a matchId (PredictionList); pages rendering
// MatchListItem rows can read m.odds directly and just use `enabled`.
export function useMatchOdds() {
  const { session } = useAuth()
  const enabled = computed(() => (session.value?.data?.user as any)?.showOdds !== false)

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
