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
}

export function useOnboardingTour() {
  const { session } = useAuth()
  const slug = useSelectedCompetition()

  const tourUser = computed(() => session.value?.data?.user as TourUser | undefined)

  const flagUnset = computed(() => {
    const u = tourUser.value
    return !!u && (u.onboardingTourDismissedAt === null || u.onboardingTourDismissedAt === undefined)
  })

  // Auto-start ONLY as the in-session hand-off from the league prompt. The prompt
  // (LeagueOnboardingDialog) fires markLeaguePromptResolved when a user settles it,
  // and only a brand-new user (no memberships, flag unset) ever sees it. Gating on
  // that fresh signal - not on the durable "prompt dismissed / already has a league"
  // state - is what keeps the tour from auto-starting (and force-navigating to
  // /matches) for the entire existing user base, whose onboardingTourDismissedAt is
  // null after this additive migration. A brand-new user auto-joined into a league
  // (so the prompt never shows) can still launch it from the account menu.
  const canAutoStart = computed(
    () => !resolved.value && !active.value && flagUnset.value && leaguePromptResolvedSignal.value,
  )

  async function start() {
    resolved.value = true
    stepIndex.value = 0
    // Run against the matches page - that is where the pick/champion/pill targets
    // live. Navigate first, then activate, so the first locate() runs on that page.
    const target = `/${slug.value}/matches`
    if (useRoute().path !== target) await navigateTo(target)
    active.value = true
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
