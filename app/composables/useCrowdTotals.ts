type CrowdTotal = { home: number; away: number; count: number }

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

  async function load() {
    if (!enabled.value || !slug.value) {
      fetched.value = {}
      return
    }
    try {
      const r = await $fetch<{ totals: Record<string, CrowdTotal> }>('/api/predictions/crowd', {
        query: { competition: slug.value },
      })
      fetched.value = r.totals ?? {}
    } catch {
      fetched.value = {}
    }
  }

  // Refetch whenever the preference flips or the competition changes; a switch
  // also drops the previous round's live patches.
  watch(slug, () => {
    patches.value = {}
  })
  watch([enabled, slug], load, { immediate: true })

  let socket: WebSocket | null = null
  onMounted(() => {
    if (!import.meta.client) return
    void load() // ensure a client-side fetch even if the watcher ran during SSR
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${proto}://${location.host}/_ws`)
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg?.type === 'crowd:update' && msg.matchId) {
          patches.value = { ...patches.value, [msg.matchId]: msg.totals }
        }
      } catch {
        // ignore
      }
    }
  })
  onBeforeUnmount(() => socket?.close())

  const totals = computed(() => (enabled.value ? { ...fetched.value, ...patches.value } : {}))
  return { enabled, totals }
}
