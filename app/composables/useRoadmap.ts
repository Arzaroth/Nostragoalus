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

// Bucket items into their status columns (shared by the public page and the
// admin editor so the grouping logic lives in one place).
export function groupByStatus(items: RoadmapItem[] | undefined): Record<RoadmapStatus, RoadmapItem[]> {
  const groups: Record<RoadmapStatus, RoadmapItem[]> = { PLANNED: [], IN_PROGRESS: [], SHIPPED: [] }
  for (const item of items ?? []) groups[item.status].push(item)
  return groups
}

export function useRoadmap() {
  return useQuery({
    queryKey: ['roadmap'],
    queryFn: ({ signal }) => $fetch<{ items: RoadmapItem[] }>('/api/roadmap', { signal }).then((r) => r.items),
  })
}
