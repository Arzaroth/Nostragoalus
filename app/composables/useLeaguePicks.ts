import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { LeagueMode } from './useLeagues'

// A member's per-league override pick (effective pick = override ?? base).
export interface LeagueOverride {
  matchId: string
  homeGoals: number
  awayGoals: number
  isOutcomeOnly: boolean
  wager: number | null
  isJoker: boolean
}

export interface LeagueCompletenessSummary {
  total: number
  complete: number
  incomplete: number
  missing: number
  needsExact: number
  needsStake: number
}

export interface LeagueCompleteness {
  leagueId: string
  name: string
  mode: LeagueMode
  summary: LeagueCompletenessSummary
}

// The caller's override picks in a moded league, keyed by matchId for the editor.
export function useLeagueOverrides(leagueId: Ref<string | null>, enabled?: Ref<boolean>) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['leagues', 'overrides', leagueId],
    queryFn: ({ signal }) =>
      $fetch<{ overrides: LeagueOverride[] }>(`/api/leagues/${leagueId.value}/overrides`, { signal }).then((r) => {
        const map: Record<string, LeagueOverride> = {}
        for (const o of r.overrides) map[o.matchId] = o
        return map
      }),
    enabled: computed(() => !!session.value?.data && !!leagueId.value && (enabled?.value ?? true)),
  })
}

// Per-league completeness of the caller's picks for the nudge.
export function useLeagueCompleteness(slug: Ref<string | undefined>) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['leagues', 'completeness', slug],
    queryFn: ({ signal }) =>
      $fetch<{ leagues: LeagueCompleteness[] }>('/api/leagues/completeness', {
        query: { competition: slug.value },
        signal,
      }).then((r) => r.leagues),
    enabled: computed(() => !!session.value?.data && !!slug.value),
  })
}

export function useLeaguePickMutations() {
  const queryClient = useQueryClient()
  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['leagues', 'overrides'] })
    queryClient.invalidateQueries({ queryKey: ['leagues', 'mode-board'] })
    queryClient.invalidateQueries({ queryKey: ['leagues', 'completeness'] })
    // picksSynced rides the league summary.
    queryClient.invalidateQueries({ queryKey: ['leagues', 'mine'] })
  }

  const upsertOverride = useMutation({
    mutationFn: (input: { leagueId: string; matchId: string; home: number; away: number; isOutcomeOnly?: boolean; wager?: number | null }) =>
      $fetch<{ id: string }>(`/api/leagues/${input.leagueId}/predictions/${input.matchId}`, {
        method: 'PUT',
        body: { home: input.home, away: input.away, isOutcomeOnly: input.isOutcomeOnly, wager: input.wager },
      }),
    onSuccess: invalidate,
  })

  const setPicksSynced = useMutation({
    mutationFn: (input: { leagueId: string; synced: boolean }) =>
      $fetch<{ ok: boolean }>(`/api/leagues/${input.leagueId}/picks-sync`, { method: 'POST', body: { synced: input.synced } }),
    onSuccess: invalidate,
  })

  const setOverrideJoker = useMutation({
    mutationFn: (input: { leagueId: string; matchId: string; isJoker: boolean }) =>
      $fetch<{ ok: boolean }>(`/api/leagues/${input.leagueId}/joker`, {
        method: 'PUT',
        body: { matchId: input.matchId, isJoker: input.isJoker },
      }),
    onSuccess: invalidate,
  })

  return { upsertOverride, setPicksSynced, setOverrideJoker }
}
