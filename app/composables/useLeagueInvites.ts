import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

export type InviteStatus = 'VALID' | 'EXPIRED' | 'EXHAUSTED'

export interface LeagueInvite {
  id: string
  token: string
  expiresAt: string | null
  maxUses: number | null
  uses: number
  createdAt: string
  status: InviteStatus
}

export function useLeagueInvites(leagueId: Ref<string | null>, enabled: Ref<boolean>) {
  const queryClient = useQueryClient()
  const key = computed(() => ['league-invites', leagueId.value])
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['league-invites', leagueId.value] })

  const query = useQuery({
    queryKey: key,
    enabled: computed(() => enabled.value && !!leagueId.value),
    queryFn: ({ signal }) =>
      $fetch<{ invites: LeagueInvite[] }>(`/api/leagues/${leagueId.value}/invites`, { signal }).then((r) => r.invites),
  })

  const create = useMutation({
    mutationFn: (input: { expiresInHours: number | null; maxUses: number | null }) =>
      $fetch<{ invite: LeagueInvite }>(`/api/leagues/${leagueId.value}/invites`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  })

  const revoke = useMutation({
    mutationFn: (inviteId: string) =>
      $fetch<{ ok: boolean }>(`/api/leagues/${leagueId.value}/invites/${inviteId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return { query, create, revoke }
}
