import { useQuery } from '@tanstack/vue-query'
import type { MyRewardDto } from '#shared/types/rewards'

// Every league prize the signed-in user currently holds, for the cabinet strip.
export function useMyRewards(enabled: MaybeRefOrGetter<boolean> = true) {
  return useQuery({
    queryKey: ['myRewards'],
    enabled,
    queryFn: ({ signal }) => $fetch<MyRewardDto[]>('/api/me/rewards', { signal }),
  })
}
