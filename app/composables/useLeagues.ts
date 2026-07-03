import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

export type LeagueRole = 'OWNER' | 'MODERATOR' | 'MEMBER'
export type LeagueVisibility = 'PRIVATE' | 'PUBLIC'

export interface League {
  id: string
  name: string
  visibility: LeagueVisibility
  role: LeagueRole
  memberCount: number
  // Present on the my-leagues list; omitted by create/join responses (the list
  // refetches right after either). Used to hide chat-less leagues from the
  // in-chat league switcher.
  chatEnabled?: boolean
  competition: { id: string; slug: string; name: string }
  joinCode?: string
}

export interface LeagueMember {
  userId: string
  name: string
  image: string | null
  role: LeagueRole
  joinedAt: string
}

export interface PublicLeague {
  id: string
  name: string
  memberCount: number
}

// My memberships; pass a slug ref to scope to one competition (the pill),
// omit it for everything (the /leagues page and the onboarding check).
export function useMyLeagues(slug?: Ref<string | undefined>) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['leagues', 'mine', slug ?? 'all'],
    queryFn: ({ signal }) =>
      $fetch<{ leagues: League[] }>('/api/leagues', {
        query: slug?.value ? { competition: slug.value } : {},
        signal,
      }).then((r) => r.leagues),
    enabled: computed(() => !!session.value?.data),
  })
}

export function usePublicLeagues(slug: Ref<string | undefined>, enabled?: Ref<boolean>) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['leagues', 'public', slug],
    queryFn: ({ signal }) =>
      $fetch<{ leagues: PublicLeague[] }>('/api/leagues/public', {
        query: slug.value ? { competition: slug.value } : {},
        signal,
      }).then((r) => r.leagues),
    enabled: computed(() => !!session.value?.data && (enabled?.value ?? true)),
  })
}

export function useLeagueDetail(leagueId: Ref<string | null>) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['leagues', 'detail', leagueId],
    queryFn: ({ signal }) =>
      $fetch<{ league: League & { role: LeagueRole | null }; members: LeagueMember[] }>(
        `/api/leagues/${leagueId.value}`,
        { signal },
      ),
    enabled: computed(() => !!session.value?.data && !!leagueId.value),
  })
}

export function useLeagueActions() {
  const queryClient = useQueryClient()

  // Membership changes also move people in/out of league leaderboards and crowds.
  function invalidate(membershipChanged: boolean) {
    queryClient.invalidateQueries({ queryKey: ['leagues'] })
    queryClient.invalidateQueries({ queryKey: ['admin-leagues'] })
    if (membershipChanged) queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
  }

  const create = useMutation({
    mutationFn: (input: { competition: string; name: string; visibility?: LeagueVisibility }) =>
      $fetch<{ league: League }>('/api/leagues', { method: 'POST', body: input }).then((r) => r.league),
    onSuccess: () => invalidate(true),
  })

  const join = useMutation({
    mutationFn: (input: { code: string }) =>
      $fetch<{ league: League }>('/api/leagues/join', { method: 'POST', body: input }).then((r) => r.league),
    onSuccess: () => invalidate(true),
  })

  const joinPublic = useMutation({
    mutationFn: (leagueId: string) =>
      $fetch<{ league: League }>(`/api/leagues/${leagueId}/join`, { method: 'POST' }).then((r) => r.league),
    onSuccess: () => invalidate(true),
  })

  const leave = useMutation({
    mutationFn: (leagueId: string) => $fetch<{ ok: boolean }>(`/api/leagues/${leagueId}/leave`, { method: 'POST' }),
    onSuccess: () => invalidate(true),
  })

  const update = useMutation({
    mutationFn: (input: { leagueId: string; name?: string; visibility?: LeagueVisibility }) =>
      $fetch<{ ok: boolean }>(`/api/leagues/${input.leagueId}`, {
        method: 'PUT',
        body: { name: input.name, visibility: input.visibility },
      }),
    onSuccess: () => invalidate(false),
  })

  const regenerateCode = useMutation({
    mutationFn: (leagueId: string) =>
      $fetch<{ joinCode: string }>(`/api/leagues/${leagueId}/regenerate-code`, { method: 'POST' }),
    onSuccess: () => invalidate(false),
  })

  const setRole = useMutation({
    mutationFn: (input: { leagueId: string; userId: string; role: 'MEMBER' | 'MODERATOR' }) =>
      $fetch<{ ok: boolean }>(`/api/leagues/${input.leagueId}/members/${input.userId}`, {
        method: 'PUT',
        body: { role: input.role },
      }),
    onSuccess: () => invalidate(false),
  })

  const kick = useMutation({
    mutationFn: (input: { leagueId: string; userId: string }) =>
      $fetch<{ ok: boolean }>(`/api/leagues/${input.leagueId}/members/${input.userId}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(true),
  })

  const transferOwnership = useMutation({
    mutationFn: (input: { leagueId: string; userId: string }) =>
      $fetch<{ ok: boolean }>(`/api/leagues/${input.leagueId}/transfer-ownership`, {
        method: 'POST',
        body: { userId: input.userId },
      }),
    onSuccess: () => invalidate(false),
  })

  const remove = useMutation({
    mutationFn: (leagueId: string) => $fetch<{ ok: boolean }>(`/api/leagues/${leagueId}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(true),
  })

  return { create, join, joinPublic, leave, update, regenerateCode, setRole, kick, transferOwnership, remove }
}
