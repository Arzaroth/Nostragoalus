import type { ReactionEmoji, ReactionTotals } from '#shared/reactions'
import { reactionListPatchScope, type ReactionPatchMessage } from '../utils/reaction-patch'

// Bulk reaction counts for the active competition's matches, kept live. The
// fixtures list holds one instance (it owns the WS connection) and passes the
// maps down to a read-only line per card, instead of one request + socket per
// card. Mirrors useCrowdTotals; reactions have no display preference, so they
// always load. League counts ride alongside the global ones when a league is
// selected (display only - members-only on the server). WS reaction:update /
// reaction:league-update patch individual matches on top.
export function useCompetitionReactions() {
  const slug = useSelectedCompetition()
  const { leagueId } = useSelectedLeague()

  const fetched = ref<Record<string, ReactionTotals>>({})
  const patches = ref<Record<string, ReactionTotals>>({})
  // The caller's own reaction per match, for the highlighted state. Refreshed on
  // load / reconnect (the aggregate WS frames carry no per-user data).
  const mine = ref<Record<string, ReactionEmoji>>({})

  // One in-flight request at a time: a competition switch (or unmount) aborts
  // the previous fetch instead of letting a stale response land late.
  let loadCtl: AbortController | null = null
  async function load() {
    loadCtl?.abort()
    if (!slug.value) {
      fetched.value = {}
      mine.value = {}
      return
    }
    const ctl = new AbortController()
    loadCtl = ctl
    try {
      const r = await $fetch<{ totals: Record<string, ReactionTotals>; mine: Record<string, ReactionEmoji> }>(
        '/api/reactions',
        { query: { competition: slug.value }, signal: ctl.signal },
      )
      fetched.value = r.totals ?? {}
      mine.value = r.mine ?? {}
    } catch {
      if (!ctl.signal.aborted) {
        fetched.value = {}
        mine.value = {}
      }
    }
  }
  onScopeDispose(() => loadCtl?.abort())
  // A competition switch drops the previous competition's live patches.
  watch(slug, () => {
    patches.value = {}
  })
  watch(slug, load, { immediate: true })

  // League counts ride next to the global ones (display only). Members get live
  // WS patches for their leagues.
  const leagueFetched = ref<Record<string, ReactionTotals>>({})
  const leaguePatches = ref<Record<string, ReactionTotals>>({})
  let leagueCtl: AbortController | null = null
  async function loadLeague() {
    leagueCtl?.abort()
    if (!leagueId.value) {
      leagueFetched.value = {}
      return
    }
    const ctl = new AbortController()
    leagueCtl = ctl
    try {
      const r = await $fetch<{ totals: Record<string, ReactionTotals> }>('/api/reactions', {
        query: { league: leagueId.value },
        signal: ctl.signal,
      })
      leagueFetched.value = r.totals ?? {}
    } catch {
      if (!ctl.signal.aborted) leagueFetched.value = {}
    }
  }
  onScopeDispose(() => leagueCtl?.abort())
  watch(leagueId, () => {
    // Clear both: keeping leagueFetched would show the previous league's counts
    // under the new league's lens until the refetch lands.
    leaguePatches.value = {}
    leagueFetched.value = {}
  })
  watch(leagueId, loadLeague, { immediate: true })

  // Shared reconnecting socket: on (re)connect, refetch the snapshot we may have
  // missed while disconnected, then resume applying live patches.
  useReconnectingSocket({
    onOpen: () => {
      void load()
      void loadLeague()
    },
    onMessage: (data) => {
      const msg = data as ReactionPatchMessage
      const scope = reactionListPatchScope(msg, leagueId.value)
      if (scope === 'global' && typeof msg.matchId === 'string' && msg.totals) {
        patches.value = { ...patches.value, [msg.matchId]: msg.totals }
      } else if (scope === 'league' && typeof msg.matchId === 'string' && msg.totals) {
        leaguePatches.value = { ...leaguePatches.value, [msg.matchId]: msg.totals }
      }
    },
  })

  const totals = computed(() => ({ ...fetched.value, ...patches.value }))
  const leagueTotals = computed(() =>
    leagueId.value ? { ...leagueFetched.value, ...leaguePatches.value } : {},
  )
  const leagueActive = computed(() => !!leagueId.value)
  return { totals, leagueTotals, mine, leagueActive }
}
