import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { FridgePinDto, FridgePinInput } from '#shared/types/achievements'

// Save the current user's fridge (the pinned showcase) for the selected
// competition. Replaces it wholesale; invalidates every cabinet view so the
// owner's and any spectators' showcases refresh.
export function useFridge() {
  const slug = useSelectedCompetition()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: FridgePinInput[]) =>
      $fetch<{ ok: boolean; fridge: FridgePinDto[] }>('/api/fridge', {
        method: 'PUT',
        body: { competition: slug.value, items },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cabinet'] })
    },
  })
}
