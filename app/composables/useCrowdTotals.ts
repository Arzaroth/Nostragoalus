// The "show everyone's totals" preference + per-match crowd sums, kept live:
// fetch per competition (auto-refetches when the competition changes), then
// patched from crowd:update WS pushes (anyone saving a prediction updates
// everyone's view, your own saves included).
export function useCrowdTotals() {
  const { session } = useAuth()
  const slug = useSelectedCompetition()
  const enabled = computed(() => (session.value?.data?.user as any)?.showCrowd === true)

  // WS patches, scoped per competition so a switch starts clean
  const patches = useState<Record<string, { home: number; away: number; count: number }>>('crowd-patches', () => ({}))

  const { data, refresh } = useFetch<{ totals: Record<string, { home: number; away: number; count: number }> }>(
    '/api/predictions/crowd',
    {
      query: computed(() => ({ competition: slug.value ?? '' })),
      immediate: enabled.value,
      // default watch on `query` is kept: switching competition refetches.
      lazy: true,
      key: 'crowd-totals',
    },
  )
  // enabling the preference mid-session triggers the first fetch
  watch(enabled, (on) => {
    if (on) refresh()
  })
  // a competition switch invalidates the previous round's live patches
  watch(slug, () => {
    patches.value = {}
  })

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

  const totals = computed(() => (enabled.value ? { ...(data.value?.totals ?? {}), ...patches.value } : {}))
  return { enabled, totals }
}
