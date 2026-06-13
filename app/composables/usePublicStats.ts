import { useQuery } from '@tanstack/vue-query'
import type { PlatformStats } from '../../server/utils/stats/platform'

// Aggregate, name-free counts for the signed-out landing teaser.
export function usePublicStats() {
  return useQuery({
    queryKey: ['public-stats'],
    queryFn: ({ signal }) => $fetch<PlatformStats>('/api/stats', { signal }),
    staleTime: 5 * 60_000,
  })
}
