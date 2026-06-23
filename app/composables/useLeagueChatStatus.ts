import { useQuery } from '@tanstack/vue-query'

// A light, cached read of a league's chat state, used to decide whether the
// floating dock should appear at all. The full socket-backed chat (history,
// keys, live messages) lives in useLeagueChat; this only needs enabled + whether
// the caller is a member. The status route 404s for non-members, so a failed
// query means "not a member" - no retry, and the dock just stays hidden.
export function useLeagueChatStatus(leagueId: Ref<string | null>) {
  const { session } = useAuth()
  const query = useQuery({
    queryKey: ['leagues', 'chat-status', leagueId],
    queryFn: ({ signal }) => $fetch<{ enabled: boolean; role: string }>(`/api/leagues/${leagueId.value}/chat`, { signal }),
    enabled: computed(() => !!session.value?.data && !!leagueId.value),
    staleTime: 60_000,
    retry: false,
  })
  const enabled = computed(() => query.data.value?.enabled ?? false)
  const isMember = computed(() => !query.isError.value && !!query.data.value)
  return { enabled, isMember, isLoading: query.isLoading }
}
