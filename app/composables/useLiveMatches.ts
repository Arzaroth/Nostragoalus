import { useQueryClient } from '@tanstack/vue-query'
import type { MatchListItem } from './useMatches'

// Keeps the fixtures list live: subscribes to every visible match over the
// shared WebSocket and patches status/score into the ['matches', slug] cache
// as match:update frames arrive (the detail page already does this per match).
export function useLiveMatches(matches: Ref<MatchListItem[] | undefined>, onScoresChanged?: () => void) {
  const qc = useQueryClient()
  const slug = useSelectedCompetition()

  const { send } = useReconnectingSocket({
    onOpen: () => subscribe(),
    onMessage: (data) => {
      const msg = data as { type?: string; match?: { id: string; status: string; fullTimeHome: number | null; fullTimeAway: number | null; winner: string | null } }
      // A score moved (or a match finished): refresh the points/lock-bearing
      // queries the patcher can't derive - prediction points land at full-time,
      // the personal stats follow.
      if ((data as { type?: string })?.type === 'scores:changed') {
        qc.invalidateQueries({ queryKey: ['predictions'] })
        onScoresChanged?.()
        return
      }
      if (msg?.type !== 'match:update' || !msg.match?.id) return
      const u = msg.match
      qc.setQueryData<MatchListItem[]>(['matches', slug], (old) =>
        (old ?? []).map((m) =>
          m.id === u.id
            ? {
                ...m,
                status: u.status as MatchListItem['status'],
                // Kickoff locks the pick: the server computes isLocked per fetch,
                // but the live patch must lock too (a pick only stays editable
                // while SCHEDULED).
                isLocked: m.isLocked || u.status !== 'SCHEDULED',
                fullTimeHome: u.fullTimeHome,
                fullTimeAway: u.fullTimeAway,
                winner: u.winner as MatchListItem['winner'],
              }
            : m,
        ),
      )
    },
  })

  // Only matches that can still change: finished/cancelled ones never emit, so
  // there's no point subscribing to them (keeps the set small even with 104
  // fixtures - the server only pushes updates for matches that actually moved).
  const liveIds = () =>
    (matches.value ?? [])
      .filter((m) => !['FINISHED', 'CANCELLED', 'POSTPONED', 'AWARDED'].includes(String(m.status)))
      .map((m) => m.id)

  function subscribe() {
    const ids = liveIds()
    if (ids.length) send({ type: 'subscribe', matchIds: ids })
  }

  // Re-subscribe when the watched set changes (competition switch, a match
  // kicking off or finishing).
  watch(() => liveIds().join(','), subscribe)
}
