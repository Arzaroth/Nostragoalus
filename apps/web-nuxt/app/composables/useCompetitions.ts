import { useQuery } from '@tanstack/vue-query'
import { FALLBACK_COMPETITION } from '#shared/competition'

export interface Competition {
  id: string
  slug: string
  name: string
}

export interface CompetitionMeta {
  slugs: string[]
  defaultSlug: string
}

// Slug set + admin-set default, fetched once and carried into the payload by
// plugins/competition-meta.server.ts so the first client render already knows
// them. The middleware validates slugs against it and the cookie seeds from it.
export function useCompetitionMeta() {
  return useState<CompetitionMeta | null>('competition-meta', () => null)
}

// Resolves the meta once per request/session. Returns null when the API is
// unreachable, so callers fall back rather than block navigation.
export async function ensureCompetitionMeta(): Promise<CompetitionMeta | null> {
  const meta = useCompetitionMeta()
  if (meta.value) return meta.value
  try {
    const res = await $fetch<{ competitions: Competition[]; defaultSlug: string }>('/api/competitions')
    meta.value = { slugs: res.competitions.map((c) => c.slug), defaultSlug: res.defaultSlug }
  } catch {
    return null
  }
  return meta.value
}

// The competition a slug-less context lands on. Admin-set server-side; the
// compiled-in constant only covers the window before the meta resolves (and an
// API that never answers).
export function useDefaultCompetition() {
  const meta = useCompetitionMeta()
  return computed(() => meta.value?.defaultSlug ?? FALLBACK_COMPETITION)
}

// The active competition is the `[competition]` path segment. On un-prefixed
// pages (account/admin/login) it falls back to the last-viewed one (cookie).
export function useSelectedCompetition() {
  const route = useRoute()
  const last = useLastCompetition()
  const fallback = useDefaultCompetition()
  return computed(() => (route.params.competition as string) || last.value || fallback.value)
}

// Remembered across navigations so "/" and legacy links land on a sensible
// competition. The cookie default is read once, at first access, so it takes
// whatever the default resolved to by then.
export function useLastCompetition() {
  const fallback = useDefaultCompetition()
  return useCookie<string>('ng-competition', { default: () => fallback.value, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
}

export function useCompetitions() {
  return useQuery({
    queryKey: ['competitions'],
    // signal: vue-query aborts it when the last subscriber unmounts, so a page
    // switch cancels the request instead of letting it run to completion.
    queryFn: ({ signal }) => $fetch<{ competitions: Competition[] }>('/api/competitions', { signal }).then((r) => r.competitions),
    staleTime: 5 * 60_000,
  })
}
