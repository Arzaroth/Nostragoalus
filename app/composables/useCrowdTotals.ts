// The "show everyone's totals" preference + the per-match crowd sums.
// Fetches only when the account preference is on.
export function useCrowdTotals() {
  const { session } = useAuth()
  const slug = useSelectedCompetition()
  const enabled = computed(() => (session.value?.data?.user as any)?.showCrowd === true)

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
  // fire only when enabled (and refresh when the competition changes)
  watch(
    [enabled, slug],
    async ([on]) => {
      if (on) await refreshNuxtData('crowd-totals').catch(() => {})
    },
    { immediate: true },
  )

  const totals = computed(() => (enabled.value ? (data.value?.totals ?? {}) : {}))
  return { enabled, totals }
}
