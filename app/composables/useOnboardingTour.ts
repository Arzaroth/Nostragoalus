// Spotlight onboarding tour: a one-time guided walk-through for a brand-new
// user. State is module-level so the overlay component and the "Take the tour"
// menu launcher drive the same instance. The server flag
// (onboardingTourDismissedAt, rides the session) gates the auto-start; finish
// and skip both stamp it so it never auto-runs again.

export interface TourStep {
  // i18n key stem: onboarding.steps.<key>.title / .body
  key: string
  // CSS selector of the element to spotlight; omitted = a centered card (the
  // welcome / done bookends). A step whose target is absent is skipped.
  target?: string
}

// Ordered against the matches page, where the tour runs. Header targets
// (notifications) exist on every authed page; the chat launcher only renders
// once the user has a league, so its step self-skips otherwise.
export const TOUR_STEPS: TourStep[] = [
  { key: 'welcome' },
  { key: 'competition', target: '[data-tour="competition"]' },
  { key: 'predict', target: '[data-tour="predict"]' },
  { key: 'champion', target: '[data-tour="champion"]' },
  { key: 'leaderboard', target: '[data-tour="leaderboard"]' },
  { key: 'notifications', target: '[data-tour="notifications"]' },
  { key: 'chat', target: '[data-tour="chat"]' },
  { key: 'done' },
]

const active = ref(false)
const stepIndex = ref(0)
// Set the moment the tour resolves this session so a late session refetch (the
// flag write lands after) cannot re-trigger the auto-start.
const resolved = ref(false)
// Flipped by the league prompt when it is dismissed this session. The session
// flag it writes only lands after a refetch, so this client signal is what lets
// the tour auto-start right after the prompt, without waiting for a reload.
const leaguePromptResolvedSignal = ref(false)

export function markLeaguePromptResolved(): void {
  leaguePromptResolvedSignal.value = true
}

interface TourUser {
  onboardingTourDismissedAt?: string | Date | null
  leaguePromptDismissedAt?: string | Date | null
}

export function useOnboardingTour() {
  const { session } = useAuth()
  const mine = useMyLeagues()
  const slug = useSelectedCompetition()

  const tourUser = computed(() => session.value?.data?.user as TourUser | undefined)

  const flagUnset = computed(() => {
    const u = tourUser.value
    return !!u && (u.onboardingTourDismissedAt === null || u.onboardingTourDismissedAt === undefined)
  })

  // Don't fight the league prompt: only auto-start once that one-time modal is
  // settled (dismissed, or the user already has a league).
  const leaguePromptSettled = computed(() => {
    if (leaguePromptResolvedSignal.value) return true
    const u = tourUser.value
    if (!u) return false
    if (u.leaguePromptDismissedAt !== null && u.leaguePromptDismissedAt !== undefined) return true
    return mine.isSuccess.value && (mine.data.value?.length ?? 0) > 0
  })

  const canAutoStart = computed(
    () => !resolved.value && !active.value && flagUnset.value && mine.isSuccess.value && leaguePromptSettled.value,
  )

  async function start() {
    resolved.value = true
    stepIndex.value = 0
    active.value = true
    // Run against the matches page - that is where the pick/champion/pill
    // targets live. A no-op if we are already there.
    const target = `/${slug.value}/matches`
    if (useRoute().path !== target) await navigateTo(target)
  }

  function next() {
    if (stepIndex.value < TOUR_STEPS.length - 1) stepIndex.value++
    else void finish()
  }

  function prev() {
    if (stepIndex.value > 0) stepIndex.value--
  }

  async function persist() {
    // Cosmetic and a no-op when signed out: a rejected save must never bubble.
    // Worst case the tour offers itself once more on the next visit.
    try {
      await $fetch('/api/me/onboarding-tour', { method: 'POST' })
    } catch {
      // ignore
    }
  }

  // Both exits are terminal and stamp the server flag.
  async function finish() {
    if (!active.value) return
    active.value = false
    await persist()
  }
  const skip = finish

  return { active, stepIndex, canAutoStart, steps: TOUR_STEPS, start, next, prev, finish, skip }
}
