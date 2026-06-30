import { useQueryClient } from '@tanstack/vue-query'
import { matchIsInPlay } from '#shared/types/match'
import type { BracketMatch, MatchStatus, NormalizedBracket } from '#shared/types/match'
import type { LiveMatchUpdate } from './useLiveMatch'

// A slot is worth subscribing to while it can still change: pre-kickoff or in
// play. Terminal slots (finished/awarded/postponed/cancelled) never emit again.
// Uses the shared status taxonomy so SUSPENDED/INTERRUPTED stay live too.
const watchable = (status: MatchStatus) => status === 'SCHEDULED' || matchIsInPlay(status)

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
        const status = (patches.value[m.id]?.status ?? m.status) as MatchStatus
        if (watchable(status)) ids.push(m.id)
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

  // Once the refetched base reports a slot as no longer in play, drop its live
  // overlay so the base wins. The base carries advancement and any late
  // correction (a score amendment, or an AWARDED overturn flipping the winner);
  // a finished slot leaves the subscribe set and gets no more frames, so a
  // lingering patch would otherwise pin its pre-correction score until reload.
  watch(bracket, (b) => {
    if (!b || !Object.keys(patches.value).length) return
    const next = { ...patches.value }
    let dirty = false
    for (const round of b.rounds) {
      for (const m of round.matches) {
        if (m.id && next[m.id] && !matchIsInPlay(m.status)) {
          delete next[m.id]
          dirty = true
        }
      }
    }
    if (dirty) patches.value = next
  })

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
