<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { flagUrl } from '../utils/format'
import type { MatchListItem } from '../composables/useMatches'

const { t } = useI18n()
const { session } = useAuth()
const last = useLastCompetition()

const authed = computed(() => !!session.value?.data)

const isLive = (m: MatchListItem) => m.status === 'LIVE' || m.status === 'PAUSED'

// The landing page has no competition route param, so this can't reuse
// useMatches (route-derived slug); same endpoint, last-used competition.
// While a match is live, poll so the pill's score doesn't fossilize (the WS
// patcher is bound to the route-derived cache key, not this one).
const { data: matches } = useQuery<MatchListItem[]>({
  queryKey: ['next-match', last],
  enabled: authed,
  refetchInterval: (query) => ((query.state.data ?? []).some(isLive) ? 60_000 : false),
  queryFn: ({ signal }) =>
    $fetch<{ matches: MatchListItem[] }>('/api/matches', {
      query: { competition: last.value },
      signal,
    }).then((r) => r.matches),
})

const liveMatches = computed(() => (matches.value ?? []).filter(isLive))

// Scrolling away dismisses, per match and per pill: the same fixture never comes
// back this session.
const NEXT_KEY = 'ng-next-cta-dismissed'
const LIVE_KEY = 'ng-live-cta-dismissed'
// Read synchronously (ClientOnly mount, sessionStorage always there): seeding in
// onMounted let a cached match render the pill for a frame before the dismissal
// kicked in.
const dismissedNextId = ref<string | null>(import.meta.client ? sessionStorage.getItem(NEXT_KEY) : null)
// Per-id dismissal for the live pill: dismissing hides what's in play now, but a
// NEW match kicking off later (an id we never dismissed) still gets its own pill.
// A single key for the whole set re-showed the pill every time one of several
// simultaneous matches ended, because the set shrank to a different key.
const dismissedLiveIds = ref(
  new Set<string>(import.meta.client ? (sessionStorage.getItem(LIVE_KEY)?.split(',').filter(Boolean) ?? []) : []),
)
function dismissLiveNow() {
  for (const m of liveMatches.value) dismissedLiveIds.value.add(m.id)
  sessionStorage.setItem(LIVE_KEY, [...dismissedLiveIds.value].join(','))
}
const liveShown = computed(() => liveMatches.value.filter((m) => !dismissedLiveIds.value.has(m.id)))
// One live match gets the detailed score pill; simultaneous kickoffs collapse to
// a count linking to the matches list - over what's still shown.
const live = computed(() => (liveShown.value.length === 1 ? liveShown.value[0]! : null))
const liveCount = computed(() => liveShown.value.length)

const now = useTimestamp({ interval: 60_000 })
const next = computed(
  () =>
    (matches.value ?? []).find(
      (m) => m.status === 'SCHEDULED' && new Date(m.kickoffTime).getTime() > now.value,
    ) ?? null,
)

const { y: scrollY } = useWindowScroll()
const faded = computed(() => Math.min(1, scrollY.value / 240))
// Clicking a pill's action navigates, and the destination's hash scroll fires
// this watcher before unmount - without the guard it dismissed BOTH pills.
const clickedAway = ref(false)
watch(scrollY, (y) => {
  if (y <= 240 || clickedAway.value) return
  if (next.value && dismissedNextId.value !== next.value.id) {
    dismissedNextId.value = next.value.id
    sessionStorage.setItem(NEXT_KEY, next.value.id)
  }
  if (liveShown.value.length) dismissLiveNow()
})

const showNext = computed(() => authed.value && !!next.value && dismissedNextId.value !== next.value.id)
const showLive = computed(() => authed.value && liveShown.value.length > 0)
// Publish visibility so the landing page hides its scroll cue while a pill is up
// (both share the bottom-center slot; the pill is the stronger affordance).
const ctaVisible = useState('ng-cta-visible', () => false)
watchEffect(() => (ctaVisible.value = showNext.value || showLive.value))
onBeforeUnmount(() => (ctaVisible.value = false))
const matchesLink = computed(() => `/${last.value}/matches`)
// Land on the matches page scrolled to this fixture (rows carry match-<id>
// anchors; the page re-scrolls once the async list renders).
const pickLink = computed(() => (next.value ? `${matchesLink.value}#match-${next.value.id}` : matchesLink.value))
// Single live match goes to its page; several go to the matches list pre-filtered
// to live, scrolled to the first one.
const liveLink = computed(() => {
  if (live.value) return `/${last.value}/matches/${live.value.id}`
  const first = liveShown.value[0]
  return first ? `${matchesLink.value}?status=live#match-${first.id}` : matchesLink.value
})

// Following a pill consumes that pill only - the other survives for the next
// visit (scroll-dismiss is suppressed for the rest of this page's life).
function dismissNext() {
  if (!next.value) return
  clickedAway.value = true
  dismissedNextId.value = next.value.id
  sessionStorage.setItem(NEXT_KEY, next.value.id)
}
function dismissLive() {
  if (!liveMatches.value.length) return
  clickedAway.value = true
  dismissLiveNow()
}
</script>

<template>
  <div
    v-if="showNext || showLive"
    class="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2"
    :style="{ opacity: 1 - faded }"
  >
    <Transition name="next-cta">
      <div
        v-if="showLive"
        class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl border px-4 py-2.5 shadow-lg text-sm max-w-[calc(100vw-0.75rem)]"
        style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        role="complementary"
        :aria-label="t('home.nextCta.live')"
      >
        <span class="flex items-center gap-1.5 font-medium" style="color: var(--ng-danger)">
          <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: var(--ng-danger)" />
          {{ t('home.nextCta.live') }}
        </span>
        <span v-if="live" class="flex flex-col sm:flex-row items-center justify-center gap-x-1.5 font-semibold text-center">
          <span class="flex items-center gap-1.5">
            <img v-if="flagUrl(live.homeTeamCode)" :src="flagUrl(live.homeTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover shrink-0" alt="" >
            {{ live.homeTeam }}
          </span>
          <span class="tabular-nums">{{ live.fullTimeHome ?? 0 }} - {{ live.fullTimeAway ?? 0 }}</span>
          <span class="flex items-center gap-1.5">
            <img v-if="flagUrl(live.awayTeamCode)" :src="flagUrl(live.awayTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover shrink-0" alt="" >
            {{ live.awayTeam }}
          </span>
        </span>
        <span v-else class="font-semibold">{{ t('home.nextCta.liveMany', { n: liveCount }) }}</span>
        <NuxtLink :to="liveLink" @click="dismissLive">
          <Button :label="t('home.nextCta.watch')" size="small" severity="danger" icon="pi pi-bolt" icon-pos="right" />
        </NuxtLink>
      </div>
    </Transition>
    <Transition name="next-cta">
      <div
        v-if="showNext && next"
        class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-2xl border px-4 py-2.5 shadow-lg text-sm max-w-[calc(100vw-0.75rem)]"
        style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        role="complementary"
        :aria-label="t('home.nextCta.title')"
      >
        <span class="flex items-center gap-2">
          <span class="font-medium" style="color: var(--p-text-muted-color)">{{ t('home.nextCta.title') }}</span>
          <Countdown :to="next.kickoffTime" />
        </span>
        <span class="flex flex-col sm:flex-row items-center justify-center gap-x-1.5 font-semibold text-center">
          <span class="flex items-center gap-1.5">
            <img v-if="flagUrl(next.homeTeamCode)" :src="flagUrl(next.homeTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover shrink-0" alt="" >
            {{ next.homeTeam }}
          </span>
          <span style="color: var(--p-text-muted-color)">-</span>
          <span class="flex items-center gap-1.5">
            <img v-if="flagUrl(next.awayTeamCode)" :src="flagUrl(next.awayTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover shrink-0" alt="" >
            {{ next.awayTeam }}
          </span>
        </span>
        <NuxtLink :to="pickLink" @click="dismissNext">
          <Button :label="t('home.nextCta.pick')" size="small" icon="pi pi-arrow-right" icon-pos="right" />
        </NuxtLink>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.next-cta-enter-active,
.next-cta-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.next-cta-enter-from,
.next-cta-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>
