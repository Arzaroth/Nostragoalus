import { emptyReactionTotals, type ReactionEmoji, type ReactionTotals } from '#shared/reactions'
import { reactionPatchScope, type ReactionPatchMessage } from '../utils/reaction-patch'

// One match's reaction counts, kept live. Global counts are public; league
// counts ride alongside when a league is selected (display only, members-only
// on the server). WS reaction:update / reaction:league-update patch on top.
export function useMatchReactions(matchId: MaybeRefOrGetter<string>) {
  const id = toRef(matchId)
  const { session } = useAuth()
  const { leagueId } = useSelectedLeague()
  const signedIn = computed(() => !!session.value?.data)

  const totals = ref<ReactionTotals>(emptyReactionTotals())
  const leagueTotals = ref<ReactionTotals>(emptyReactionTotals())
  const mine = ref<ReactionEmoji | null>(null)
  const pending = ref(false)

  // One in-flight request per scope: a match switch (or unmount) aborts the
  // previous fetch instead of letting a stale response land late.
  let loadCtl: AbortController | null = null
  async function load() {
    loadCtl?.abort()
    if (!id.value) return
    const ctl = new AbortController()
    loadCtl = ctl
    try {
      const r = await $fetch<{ totals: ReactionTotals; mine: ReactionEmoji | null }>(`/api/reactions/${id.value}`, {
        signal: ctl.signal,
      })
      totals.value = r.totals
      mine.value = r.mine
    } catch {
      if (!ctl.signal.aborted) {
        totals.value = emptyReactionTotals()
        mine.value = null
      }
    }
  }

  let leagueCtl: AbortController | null = null
  async function loadLeague() {
    leagueCtl?.abort()
    if (!id.value || !leagueId.value) {
      leagueTotals.value = emptyReactionTotals()
      return
    }
    const ctl = new AbortController()
    leagueCtl = ctl
    try {
      const r = await $fetch<{ totals: ReactionTotals }>(`/api/reactions/${id.value}`, {
        query: { league: leagueId.value },
        signal: ctl.signal,
      })
      leagueTotals.value = r.totals
    } catch {
      if (!ctl.signal.aborted) leagueTotals.value = emptyReactionTotals()
    }
  }

  onScopeDispose(() => {
    loadCtl?.abort()
    leagueCtl?.abort()
  })

  watch(id, load, { immediate: true })
  watch(leagueId, () => {
    // Clear so the previous league's counts don't show under the new lens.
    leagueTotals.value = emptyReactionTotals()
  })
  watch([id, leagueId], loadLeague, { immediate: true })

  // Shared reconnecting socket: on (re)connect, refetch the snapshot we may have
  // missed while disconnected, then resume applying live patches.
  useReconnectingSocket({
    onOpen: () => {
      void load()
      void loadLeague()
    },
    onMessage: (data) => {
      const msg = data as ReactionPatchMessage
      const scope = reactionPatchScope(msg, id.value, leagueId.value)
      if (scope === 'global' && msg.totals) totals.value = msg.totals
      else if (scope === 'league' && msg.totals) leagueTotals.value = msg.totals
    },
  })

  // Tap an emoji to set it; tapping the active one clears it (toggle off).
  async function react(emoji: ReactionEmoji) {
    if (!signedIn.value || pending.value) return
    const next = mine.value === emoji ? null : emoji
    // Optimistic highlight; the per-emoji counts arrive via the WS push the
    // server fires right after the write (to us and everyone watching).
    mine.value = next
    pending.value = true
    try {
      await $fetch('/api/reactions', { method: 'PUT', body: { matchId: id.value, emoji: next } })
    } catch {
      // Roll the highlight back to server truth on failure.
      await load()
    } finally {
      pending.value = false
    }
  }

  const leagueActive = computed(() => !!leagueId.value)
  return { totals, leagueTotals, mine, leagueActive, signedIn, pending, react }
}
