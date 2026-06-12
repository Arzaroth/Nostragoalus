<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { flagUrl } from '../utils/format'
import type { MatchListItem } from '../composables/useMatches'

const { t } = useI18n()
const { session } = useAuth()
const last = useLastCompetition()

const authed = computed(() => !!session.value?.data)

// The landing page has no competition route param, so this can't reuse
// useMatches (route-derived slug); same endpoint, last-used competition.
const { data: matches } = useQuery({
  queryKey: ['next-match', last],
  enabled: authed,
  queryFn: ({ signal }) =>
    $fetch<{ matches: MatchListItem[] }>('/api/matches', {
      query: { competition: last.value },
      signal,
    }).then((r) => r.matches),
})

const now = useTimestamp({ interval: 60_000 })
const next = computed(
  () =>
    (matches.value ?? []).find(
      (m) => m.status === 'SCHEDULED' && new Date(m.kickoffTime).getTime() > now.value,
    ) ?? null,
)

// Scrolling away dismisses, per match: the same fixture never comes back this
// session, the next fixture gets its own shot.
const DISMISS_KEY = 'ng-next-cta-dismissed'
const dismissedId = ref<string | null>(null)
onMounted(() => {
  dismissedId.value = sessionStorage.getItem(DISMISS_KEY)
})
const { y: scrollY } = useWindowScroll()
const faded = computed(() => Math.min(1, scrollY.value / 240))
watch(scrollY, (y) => {
  if (y > 240 && next.value && dismissedId.value !== next.value.id) {
    dismissedId.value = next.value.id
    sessionStorage.setItem(DISMISS_KEY, next.value.id)
  }
})

const show = computed(() => authed.value && !!next.value && dismissedId.value !== next.value.id)
const matchesLink = computed(() => `/${last.value}/matches`)
</script>

<template>
  <Transition name="next-cta">
    <div
      v-if="show && next"
      class="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-lg text-sm whitespace-nowrap"
      style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
      :style="{ opacity: 1 - faded }"
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
      <NuxtLink :to="matchesLink">
        <Button :label="t('home.nextCta.pick')" size="small" icon="pi pi-arrow-right" icon-pos="right" />
      </NuxtLink>
    </div>
  </Transition>
</template>

<style scoped>
.next-cta-enter-active,
.next-cta-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.next-cta-enter-from,
.next-cta-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.5rem);
}
</style>
