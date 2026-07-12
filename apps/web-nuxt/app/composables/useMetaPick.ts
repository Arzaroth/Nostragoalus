import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'

// Shared query/mutation plumbing for a "meta pick" (champion, best scorer): the
// competition-scoped GET, the PUT that sets or re-picks, and invalidating the
// pick + leaderboard on success. The per-feature response DTO (TData) and
// mutation input (TInput) stay in each composable; only the endpoint, query-key
// namespace and request body differ. The endpoint is a plain string on purpose -
// passing a route literal sends $fetch down an inference path that recurses to
// "excessive stack depth" on these endpoints.
export function useMetaPick<TData, TInput>(opts: {
  key: string
  endpoint: string
  buildBody: (input: TInput) => Record<string, unknown>
}) {
  const slug = useSelectedCompetition()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: [opts.key, slug],
    queryFn: ({ signal }) =>
      $fetch<TData>(opts.endpoint, { query: slug.value ? { competition: slug.value } : {}, signal }),
  })

  const setPick = useMutation({
    mutationFn: (input: TInput) =>
      $fetch<{ ok: boolean }>(opts.endpoint, {
        method: 'PUT',
        body: { competition: slug.value, ...opts.buildBody(input) },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [opts.key] })
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })

  return { query, setPick }
}
