import { useQueryClient } from '@tanstack/vue-query'
import type { MatchListItem } from './useMatches'

// Keeps the fixtures list live: subscribes to every visible match over the
// shared WebSocket and patches status/score into the ['matches', slug] cache
// as match:update frames arrive (the detail page already does this per match).
export function useLiveMatches(matches: Ref<MatchListItem[] | undefined>) {
  const qc = useQueryClient()
  const slug = useSelectedCompetition()

  const { send } = useReconnectingSocket({
    onOpen: () => subscribe(),
    onMessage: (data) => {
      const msg = data as { type?: string; match?: { id: string; status: string; fullTimeHome: number | null; fullTimeAway: number | null; winner: string | null } }
      if (msg?.type !== 'match:update' || !msg.match?.id) return
      const u = msg.match
      qc.setQueryData<MatchListItem[]>(['matches', slug], (old) =>
        (old ?? []).map((m) =>
          m.id === u.id
            ? { ...m, status: u.status as MatchListItem['status'], fullTimeHome: u.fullTimeHome, fullTimeAway: u.fullTimeAway, winner: u.winner as MatchListItem['winner'] }
            : m,
        ),
      )
    },
  })

  function subscribe() {
    const ids = (matches.value ?? []).map((m) => m.id)
    if (ids.length) send({ type: 'subscribe', matchIds: ids })
  }

  // Re-subscribe when the visible set changes (competition switch, first load).
  watch(() => (matches.value ?? []).map((m) => m.id).join(','), subscribe)
}
