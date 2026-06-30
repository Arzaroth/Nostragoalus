import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

export type LeagueRole = 'OWNER' | 'MODERATOR' | 'MEMBER'
export type LeagueVisibility = 'PRIVATE' | 'PUBLIC'
export type LeagueMode = 'NORMAL' | 'EASY' | 'HARD' | 'HARDCORE'

export const LEAGUE_MODES: LeagueMode[] = ['NORMAL', 'EASY', 'HARD', 'HARDCORE']

export interface League {
  id: string
  name: string
  visibility: LeagueVisibility
  mode: LeagueMode
  lives: number | null
  role: LeagueRole
  memberCount: number
  // The owner/moderator-authored markdown blurb. Present on the league detail
  // response (null when unset); omitted by the list responses.
  description?: string | null
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
    mutationFn: (input: { competition: string; name: string; visibility?: LeagueVisibility; mode?: LeagueMode; lives?: number }) =>
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
    mutationFn: (input: {
      leagueId: string
      name?: string
      visibility?: LeagueVisibility
      description?: string | null
      featuredTeamCode?: string | null
      mode?: LeagueMode
      lives?: number
    }) =>
      $fetch<{ ok: boolean }>(`/api/leagues/${input.leagueId}`, {
        method: 'PUT',
        body: {
          name: input.name,
          visibility: input.visibility,
          description: input.description,
          featuredTeamCode: input.featuredTeamCode,
          mode: input.mode,
          lives: input.lives,
        },
      }),
    // Only a mode swap re-scores the boards; a rename/visibility change does not.
    onSuccess: (_data, input) => {
      invalidate(input.mode !== undefined)
      // The featured team drives the TEAM_SPECIALIST prize standings.
      queryClient.invalidateQueries({ queryKey: ['leagueRewards'] })
    },
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

export interface ModePointsRow {
  rank: number
  userId: string
  displayName: string
  image: string | null
  points: number
  exactCount: number
  outcomeCount: number
}

export interface SurvivalRow {
  rank: number
  userId: string
  displayName: string
  image: string | null
  alive: boolean
  livesLeft: number
  survived: number
  eliminatedRoundLabel: string | null
}

export type ModeBoard =
  | { kind: 'points'; mode: LeagueMode; rows: ModePointsRow[] }
  | { kind: 'survival'; mode: 'HARDCORE'; rows: SurvivalRow[] }

// The re-scored board for a moded league (easy/hard points or hardcore survival).
// Disabled for NORMAL leagues, which use the standard leaderboard instead.
export function useLeagueModeBoard(leagueId: Ref<string | null>, mode: Ref<LeagueMode | undefined>) {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['leagues', 'mode-board', leagueId],
    queryFn: ({ signal }) =>
      $fetch<{ board: ModeBoard; mode: LeagueMode; lives: number | null }>(
        `/api/leagues/${leagueId.value}/mode-board`,
        { signal },
      ),
    enabled: computed(() => !!session.value?.data && !!leagueId.value && !!mode.value && mode.value !== 'NORMAL'),
  })
}
