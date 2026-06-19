import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { MatchMediaItem, MatchMediaKind } from '#shared/match-media'

export function useMatchMedia(id: Ref<string>) {
  return useQuery({
    queryKey: ['match-media', id],
    queryFn: ({ signal }) =>
      $fetch<{ media: MatchMediaItem[] }>(`/api/matches/${id.value}/media`, { signal }).then((r) => r.media),
  })
}

export function useMatchMediaActions(id: Ref<string>) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['match-media', id] })

  const add = useMutation({
    mutationFn: (input: { kind: MatchMediaKind; url: string; label?: string; embeddable?: boolean | null; sandbox?: boolean | null; allow?: string | null }) =>
      $fetch<{ id: string }>(`/api/admin/matches/${id.value}/media`, { method: 'POST', body: input }),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (mediaId: string) =>
      $fetch<{ ok: boolean }>(`/api/admin/matches/${id.value}/media/${mediaId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })

  return { add, remove }
}
