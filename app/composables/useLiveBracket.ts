import { useQueryClient } from '@tanstack/vue-query'
import type { BracketMatch, MatchStatus, NormalizedBracket } from '#shared/types/match'
import type { LiveMatchUpdate } from './useLiveMatch'

// Statuses that can still change - finished/cancelled slots never emit again, so
// there's no point subscribing to them.
const DONE = new Set(['FINISHED', 'CANCELLED', 'POSTPONED', 'AWARDED'])

// Keeps the knockout bracket live. The bracket's scores come from the cached
// provider base (10-min TTL), so a plain refetch can't show a live scoreline.
// Instead we overlay WS match:update frames - the freshest source, straight from
// the match row - onto the matching slots, and refetch the base on scores:changed
// only to pull in advancement (a finished feeder filling the next slot) and the
// live group-qualifier projections. Overlay over refetch: neither clobbers the
// other, so the scoreline ticks while advancement still updates.
export function useLiveBracket(bracket: Ref<NormalizedBracket | undefined>) {
  const qc = useQueryClient()
  const patches = ref<Record<string, Partial<BracketMatch>>>({})

  const liveIds = () => {
    const ids: string[] = []
    for (const round of bracket.value?.rounds ?? []) {
      for (const m of round.matches) {
        if (!m.id) continue
        const status = String(patches.value[m.id]?.status ?? m.status)
        if (!DONE.has(status)) ids.push(m.id)
      }
    }
    return ids
  }

  const { send } = useReconnectingSocket({
    onOpen: () => subscribe(),
    onMessage: (data) => {
      const msg = data as { type?: string; match?: LiveMatchUpdate }
      if (msg?.type === 'scores:changed') {
        qc.invalidateQueries({ queryKey: ['bracket'] })
        return
      }
      if (msg?.type !== 'match:update' || !msg.match?.id) return
      const u = msg.match
      patches.value = {
        ...patches.value,
        [u.id]: {
          status: u.status as MatchStatus,
          homeScore: u.fullTimeHome,
          awayScore: u.fullTimeAway,
          homePens: u.penaltiesHome,
          awayPens: u.penaltiesAway,
          // A live tie reads DRAW on the match row; the bracket only highlights a
          // decided winner, so anything but HOME/AWAY clears the highlight.
          winner: u.winner === 'HOME' || u.winner === 'AWAY' ? u.winner : null,
        },
      }
    },
  })

  function subscribe() {
    const ids = liveIds()
    if (ids.length) send({ type: 'subscribe', matchIds: ids })
  }

  // Re-subscribe when the watchable set changes (first load, a match kicking off
  // or finishing, competition switch).
  watch(() => liveIds().join(','), subscribe)

  const live = computed<NormalizedBracket | undefined>(() => {
    const b = bracket.value
    const p = patches.value
    if (!b || !Object.keys(p).length) return b
    return {
      ...b,
      rounds: b.rounds.map((round) => ({
        ...round,
        matches: round.matches.map((m) => (m.id && p[m.id] ? { ...m, ...p[m.id] } : m)),
      })),
    }
  })

  return { bracket: live }
}
