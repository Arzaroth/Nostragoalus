export type CrowdTotal = { home: number; away: number; count: number }

// The "show everyone's totals" preference + per-match crowd sums, kept live.
// Plain ref + explicit refetch on (enabled, competition) change - a shared
// useFetch key served the previous competition's cached totals on a switch.
// WS crowd:update pushes patch individual matches on top.
export function useCrowdTotals() {
  const { session } = useAuth()
  const slug = useSelectedCompetition()
  const enabled = computed(() => (session.value?.data?.user as any)?.showCrowd === true)

  const fetched = ref<Record<string, CrowdTotal>>({})
  const patches = ref<Record<string, CrowdTotal>>({})

  // One in-flight request at a time: a competition switch (or unmount) aborts
  // the previous fetch instead of letting a stale response land late.
  let loadCtl: AbortController | null = null
  async function load() {
    loadCtl?.abort()
    if (!enabled.value || !slug.value) {
      fetched.value = {}
      return
    }
    const ctl = new AbortController()
    loadCtl = ctl
    try {
      const r = await $fetch<{ totals: Record<string, CrowdTotal> }>('/api/predictions/crowd', {
        query: { competition: slug.value },
        signal: ctl.signal,
      })
      fetched.value = r.totals ?? {}
    } catch {
      if (!ctl.signal.aborted) fetched.value = {}
    }
  }
  onScopeDispose(() => loadCtl?.abort())

  // Refetch whenever the preference flips or the competition changes; a switch
  // also drops the previous round's live patches.
  watch(slug, () => {
    patches.value = {}
  })
  watch([enabled, slug], load, { immediate: true })

  // League crowd rides next to the global one (display only - the scoring
  // bonus uses everyone). Members get live WS patches for their leagues.
  const { leagueId } = useSelectedLeague()
  const leagueFetched = ref<Record<string, CrowdTotal>>({})
  const leaguePatches = ref<Record<string, CrowdTotal>>({})
  let leagueCtl: AbortController | null = null
  async function loadLeague() {
    leagueCtl?.abort()
    if (!enabled.value || !leagueId.value) {
      leagueFetched.value = {}
      return
    }
    const ctl = new AbortController()
    leagueCtl = ctl
    try {
      const r = await $fetch<{ totals: Record<string, CrowdTotal> }>('/api/predictions/crowd', {
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
    leaguePatches.value = {}
  })
  watch([enabled, leagueId], loadLeague, { immediate: true })

  let socket: WebSocket | null = null
  onMounted(() => {
    if (!import.meta.client) return
    void load() // ensure a client-side fetch even if the watcher ran during SSR
    void loadLeague()
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${proto}://${location.host}/_ws`)
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        const scope = crowdPatchScope(msg, leagueId.value)
        if (scope === 'global') patches.value = { ...patches.value, [msg.matchId]: msg.totals }
        else if (scope === 'league') leaguePatches.value = { ...leaguePatches.value, [msg.matchId]: msg.totals }
      } catch {
        // ignore
      }
    }
  })
  onBeforeUnmount(() => socket?.close())

  const totals = computed(() => (enabled.value ? { ...fetched.value, ...patches.value } : {}))
  const leagueTotals = computed(() =>
    enabled.value && leagueId.value ? { ...leagueFetched.value, ...leaguePatches.value } : {},
  )
  const leagueActive = computed(() => enabled.value && !!leagueId.value)
  return { enabled, totals, leagueTotals, leagueActive }
}
