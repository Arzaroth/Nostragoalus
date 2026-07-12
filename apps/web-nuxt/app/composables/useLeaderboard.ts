import { useQuery } from '@tanstack/vue-query'
import type { LeaderboardRow as ServerLeaderboardRow } from '../../server/utils/leaderboard/service'

// The API adds movement on top of the server row; everything else is the
// canonical server interface (championCode/championPoints included).
export type LeaderboardRow = ServerLeaderboardRow & { movement?: number | null }

// A row as the boards render it: a real player row, or a display-only bot ghost
// carrying an icon. Shared by LeaderboardRowCard and the leaderboard page so the
// card's prop type and the page's row list can't drift.
export type LeaderboardDisplayRow = LeaderboardRow & { isBot?: boolean; icon?: string }

interface LeaderboardResponse {
  rows: LeaderboardRow[]
  // League scope only: members left off the board for visibility reasons
  // (admin-hidden, or private profiles the viewer can't see).
  hiddenCount?: number
}

function leaderboardQuery(global?: Ref<boolean>, leagueId?: Ref<string | null>) {
  const slug = useSelectedCompetition()
  const isGlobal = global ?? ref(false)
  const league = leagueId ?? ref(null)
  return {
    // league is part of the key: switching the pill refetches and keeps the
    // previous scope cached for an instant toggle back.
    queryKey: ['leaderboard', slug, isGlobal, league] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      $fetch<LeaderboardResponse>('/api/leaderboard', {
        query: isGlobal.value
          ? { global: 'true' }
          : league.value
            ? { league: league.value }
            : slug.value
              ? { competition: slug.value }
              : {},
        signal,
      }),
  }
}

export function useLeaderboard(global?: Ref<boolean>, leagueId?: Ref<string | null>) {
  return useQuery({ ...leaderboardQuery(global, leagueId), select: (r) => r.rows })
}

// Shares the cache key with useLeaderboard (same fetch, different projection),
// so the board and its "+N hidden" marker never disagree.
export function useLeaderboardHiddenCount(leagueId: Ref<string | null>) {
  return useQuery({ ...leaderboardQuery(ref(false), leagueId), select: (r) => r.hiddenCount ?? 0 })
}
