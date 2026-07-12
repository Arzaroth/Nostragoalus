import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { ShowcasePinDto, ShowcasePinInput } from '#shared/types/achievements'

// Save the current user's showcase (the pinned achievements) for the selected
// competition. Replaces it wholesale; invalidates every cabinet view so the
// owner's and any spectators' showcases refresh.
export function useShowcase() {
  const slug = useSelectedCompetition()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: ShowcasePinInput[]) =>
      $fetch<{ ok: boolean; showcase: ShowcasePinDto[] }>('/api/showcase', {
        method: 'PUT',
        body: { competition: slug.value, items },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cabinet'] })
    },
  })
}
