import type { League } from './useLeagues'
import { pruneLeagueSelection, selectedLeagueFor, withLeagueSelection, type LeagueSelections } from '../utils/league-cookie'

// One cookie maps competition slug -> selected league id (see league-cookie.ts).
// Singleton per app: useCookie returns an independent ref on every call, so the
// pill and the pages must share one instance to stay reactive to each other.
export function useLeagueSelections(): Ref<LeagueSelections> {
  const app = useNuxtApp() as { _ngLeagueSelections?: Ref<LeagueSelections> }
  app._ngLeagueSelections ??= useCookie<LeagueSelections>('ng-league', {
    default: () => ({}),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  return app._ngLeagueSelections
}

// The league view filter for the current competition. Cookie-backed (not URL):
// leagues are a private lens on the same pages, and the cookie reads the same
// on SSR and client so there is no hydration flash.
export function useSelectedLeague() {
  const slug = useSelectedCompetition()
  const selections = useLeagueSelections()
  const mine = useMyLeagues(slug)

  const leagueId = computed<string | null>({
    get: () => selectedLeagueFor(selections.value, slug.value),
    set: (id) => {
      selections.value = withLeagueSelection(selections.value, slug.value, id)
    },
  })

  const league = computed<League | null>(
    () => (mine.data.value ?? []).find((l) => l.id === leagueId.value) ?? null,
  )

  // Drop a stored selection the user can no longer use (left/kicked/deleted).
  // selections is a watch source too (stale cookie writes, other tabs); the
  // changed-check below keeps that from looping.
  watch(
    [() => mine.isSuccess.value, () => mine.data.value, slug, selections],
    () => {
      if (!mine.isSuccess.value) return
      const validIds = (mine.data.value ?? []).map((l) => l.id)
      const pruned = pruneLeagueSelection(selections.value, slug.value, validIds)
      if (selectedLeagueFor(pruned, slug.value) !== selectedLeagueFor(selections.value, slug.value)) {
        selections.value = pruned
      }
    },
    { immediate: true },
  )

  return { leagueId, league, leagues: mine.data, isLoading: mine.isLoading }
}
