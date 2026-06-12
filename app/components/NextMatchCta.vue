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
// One live match gets the detailed score pill; simultaneous kickoffs (group
// stage final rounds) collapse to a count linking to the matches list.
const live = computed(() => (liveMatches.value.length === 1 ? liveMatches.value[0]! : null))
const liveCount = computed(() => liveMatches.value.length)

const now = useTimestamp({ interval: 60_000 })
const next = computed(
  () =>
    (matches.value ?? []).find(
      (m) => m.status === 'SCHEDULED' && new Date(m.kickoffTime).getTime() > now.value,
    ) ?? null,
)

// Scrolling away dismisses, per match and per pill: the same fixture never
// comes back this session, the next fixture gets its own shot.
const NEXT_KEY = 'ng-next-cta-dismissed'
const LIVE_KEY = 'ng-live-cta-dismissed'
// Read synchronously (ClientOnly mount, sessionStorage always there): seeding
// in onMounted let a cached match render the pill for a frame before the
// dismissal kicked in.
const dismissedNextId = ref<string | null>(import.meta.client ? sessionStorage.getItem(NEXT_KEY) : null)
const dismissedLiveId = ref<string | null>(import.meta.client ? sessionStorage.getItem(LIVE_KEY) : null)
const { y: scrollY } = useWindowScroll()
const faded = computed(() => Math.min(1, scrollY.value / 240))
// Dismissal key for the live pill: the (sorted) id set, so a new simultaneous
// batch - or a different single match - gets its own shot.
const liveKey = computed(() =>
  liveMatches.value.map((m) => m.id).sort().join('+') || null,
)
watch(scrollY, (y) => {
  if (y <= 240) return
  if (next.value && dismissedNextId.value !== next.value.id) {
    dismissedNextId.value = next.value.id
    sessionStorage.setItem(NEXT_KEY, next.value.id)
  }
  if (liveKey.value && dismissedLiveId.value !== liveKey.value) {
    dismissedLiveId.value = liveKey.value
    sessionStorage.setItem(LIVE_KEY, liveKey.value)
  }
})

const showNext = computed(() => authed.value && !!next.value && dismissedNextId.value !== next.value.id)
const showLive = computed(() => authed.value && !!liveKey.value && dismissedLiveId.value !== liveKey.value)
const matchesLink = computed(() => `/${last.value}/matches`)
// Land on the matches page scrolled to this fixture (rows carry match-<id>
// anchors; the page re-scrolls once the async list renders).
const pickLink = computed(() => (next.value ? `${matchesLink.value}#match-${next.value.id}` : matchesLink.value))
// Single live match goes to its page; several go to the matches list
// pre-filtered to live, scrolled to the first one.
const liveLink = computed(() => {
  if (live.value) return `/${last.value}/matches/${live.value.id}`
  const first = liveMatches.value[0]
  return first ? `${matchesLink.value}?status=live#match-${first.id}` : matchesLink.value
})

// Following a pill counts as consuming it - same flags as scroll-dismiss.
function dismissNext() {
  if (!next.value) return
  dismissedNextId.value = next.value.id
  sessionStorage.setItem(NEXT_KEY, next.value.id)
}
function dismissLive() {
  if (!liveKey.value) return
  dismissedLiveId.value = liveKey.value
  sessionStorage.setItem(LIVE_KEY, liveKey.value)
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
        class="flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-lg text-sm whitespace-nowrap"
        style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        role="complementary"
        :aria-label="t('home.nextCta.live')"
      >
        <span class="flex items-center gap-1.5 font-medium" style="color: var(--ng-danger)">
          <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: var(--ng-danger)" />
          {{ t('home.nextCta.live') }}
        </span>
        <span v-if="live" class="flex items-center gap-1.5 font-semibold">
          <img v-if="flagUrl(live.homeTeamCode)" :src="flagUrl(live.homeTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover" alt="" >
          {{ live.homeTeam }}
          <span>{{ live.fullTimeHome ?? 0 }} - {{ live.fullTimeAway ?? 0 }}</span>
          <img v-if="flagUrl(live.awayTeamCode)" :src="flagUrl(live.awayTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover" alt="" >
          {{ live.awayTeam }}
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
        class="flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-lg text-sm whitespace-nowrap"
        style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        role="complementary"
        :aria-label="t('home.nextCta.title')"
      >
        <span class="font-medium" style="color: var(--p-text-muted-color)">{{ t('home.nextCta.title') }}</span>
        <span class="flex items-center gap-1.5 font-semibold">
          <img v-if="flagUrl(next.homeTeamCode)" :src="flagUrl(next.homeTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover" alt="" >
          {{ next.homeTeam }}
          <span style="color: var(--p-text-muted-color)">-</span>
          <img v-if="flagUrl(next.awayTeamCode)" :src="flagUrl(next.awayTeamCode) || ''" class="w-5 h-3.5 rounded-sm object-cover" alt="" >
          {{ next.awayTeam }}
        </span>
        <Countdown :to="next.kickoffTime" />
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
