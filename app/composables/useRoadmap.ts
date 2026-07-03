import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

export type RoadmapStatus = 'PLANNED' | 'IN_PROGRESS' | 'SHIPPED' | 'SUGGESTED'
export type RoadmapModeration = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface RoadmapItem {
  id: string
  title: string
  description: string | null
  status: RoadmapStatus
  position: number
  voteCount: number
  viewerHasVoted: boolean
  // Hybrid moderation: a public but not-yet-blessed suggestion (PENDING).
  underReview: boolean
  updatedAt: string
}

// Admin triage view: carries author + moderation state alongside the vote tally,
// but not the per-viewer flag (an admin triages, they don't vote from here).
export interface AdminRoadmapItem {
  id: string
  title: string
  description: string | null
  status: RoadmapStatus
  position: number
  authorId: string | null
  moderationStatus: RoadmapModeration
  voteCount: number
  updatedAt: string
}

// The kanban board columns, left to right as a pipeline: community ideas ->
// planned -> being built -> shipped. Shared by the public board and the admin
// board so both render the same columns in the same order.
export const ROADMAP_COLUMNS: Array<{ status: RoadmapStatus; key: string; icon: string; severity: string }> = [
  { status: 'SUGGESTED', key: 'roadmap.suggested', icon: 'pi pi-lightbulb', severity: 'contrast' },
  { status: 'PLANNED', key: 'roadmap.planned', icon: 'pi pi-clock', severity: 'secondary' },
  { status: 'IN_PROGRESS', key: 'roadmap.inProgress', icon: 'pi pi-spinner', severity: 'info' },
  { status: 'SHIPPED', key: 'roadmap.shipped', icon: 'pi pi-check-circle', severity: 'success' },
]

// Bucket items into their status columns (shared by the public page and the
// admin editor so the grouping logic lives in one place). Generic so the admin
// item shape (with moderation/author fields) buckets the same way.
export function groupByStatus<T extends { status: RoadmapStatus }>(
  items: T[] | undefined,
): Record<RoadmapStatus, T[]> {
  const groups: Record<RoadmapStatus, T[]> = { PLANNED: [], IN_PROGRESS: [], SHIPPED: [], SUGGESTED: [] }
  for (const item of items ?? []) groups[item.status].push(item)
  return groups
}

export function useRoadmap() {
  return useQuery({
    queryKey: ['roadmap'],
    queryFn: ({ signal }) => $fetch<{ items: RoadmapItem[] }>('/api/roadmap', { signal }).then((r) => r.items),
    // The list changes from other users (new suggestions, votes) and admin moves,
    // so returning to the page always refetches rather than serving the 60s-stale
    // cache - otherwise a suggestion added elsewhere is invisible until reload.
    refetchOnMount: 'always',
  })
}

// Public write actions: submit a suggestion and toggle an upvote. Both refetch
// the roadmap on success (the derived vote counts and viewer flags live only in
// the list response, so a refetch is the source of truth).
export function useRoadmapActions() {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roadmap'] })

  const submit = useMutation({
    mutationFn: (input: { title: string; description?: string }) =>
      $fetch<unknown>('/api/roadmap/suggestions', { method: 'POST', body: input }),
    onSuccess: () => invalidate(),
  })

  const vote = useMutation({
    mutationFn: (id: string) =>
      $fetch<{ voted: boolean; voteCount: number }>(`/api/roadmap/${id}/vote`, { method: 'POST' }),
    onSuccess: () => invalidate(),
  })

  return { submit, vote }
}
