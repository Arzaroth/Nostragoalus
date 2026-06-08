// The "show everyone's totals" preference + per-match crowd sums, kept live:
// initial fetch per competition, then patched from crowd:update WS pushes
// (anyone saving a prediction updates everyone's view, including your own saves).
export function useCrowdTotals() {
  const { session } = useAuth()
  const slug = useSelectedCompetition()
  const enabled = computed(() => (session.value?.data?.user as any)?.showCrowd === true)

  const patches = useState<Record<string, { home: number; away: number; count: number }>>('crowd-patches', () => ({}))

  const { data } = useFetch<{ totals: Record<string, { home: number; away: number; count: number }> }>(
    '/api/predictions/crowd',
    {
      query: computed(() => (slug.value ? { competition: slug.value } : {})),
      immediate: false,
      watch: false,
      lazy: true,
      key: 'crowd-totals',
    },
  )
  watch(
    [enabled, slug],
    async ([on]) => {
      if (on) await refreshNuxtData('crowd-totals').catch(() => {})
    },
    { immediate: true },
  )

  // one socket per consumer page; cheap, and the hub broadcasts to everyone
  let socket: WebSocket | null = null
  onMounted(() => {
    if (!import.meta.client) return
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

  const totals = computed(() =>
    enabled.value ? { ...(data.value?.totals ?? {}), ...patches.value } : {},
  )
  return { enabled, totals }
}
