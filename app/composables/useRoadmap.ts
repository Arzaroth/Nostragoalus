import { useQuery } from '@tanstack/vue-query'

export type RoadmapStatus = 'PLANNED' | 'IN_PROGRESS' | 'SHIPPED'

export interface RoadmapItem {
  id: string
  title: string
  description: string | null
  status: RoadmapStatus
  position: number
  updatedAt: string
}

export function useRoadmap() {
  return useQuery({
    queryKey: ['roadmap'],
    queryFn: ({ signal }) => $fetch<{ items: RoadmapItem[] }>('/api/roadmap', { signal }).then((r) => r.items),
  })
}
