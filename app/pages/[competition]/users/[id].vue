<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const slug = useSelectedCompetition()
const global = computed({
  get: () => route.query.global === '1',
  set: (v: boolean) => router.replace({ query: { ...route.query, global: v ? '1' : undefined } }),
})
const scopeOptions = computed(() => [
  { label: t('leaderboard.thisCompetition'), value: false },
  { label: t('leaderboard.global'), value: true },
])
const { data, error } = await useFetch<{
  user: { id: string; name: string; image: string | null }
  champion: { teamCode: string | null; teamName: string; awardedPoints: number } | null
  bestScorer: { teamCode: string | null; teamName: string; playerName: string; awardedPoints: number } | null
  predictions: (MyPrediction & { competitionSlug?: string })[]
  adminView?: boolean
}>(`/api/users/${route.params.id}/predictions`, {
  query: computed(() => ({ competition: global.value ? 'global' : (slug.value ?? undefined) })),
})

// Admin view includes not-yet-kicked-off picks; split them off behind a divider.
const now = Date.now()
const kickedOff = computed(() => (data.value?.predictions ?? []).filter((p) => new Date(p.kickoffTime).getTime() <= now))
const upcoming = computed(() => (data.value?.predictions ?? []).filter((p) => new Date(p.kickoffTime).getTime() > now))
</script>

<template>
  <div v-if="data">
    <NuxtLink :to="`/${slug}/leaderboard`" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
      <i class="pi pi-arrow-left" /> {{ t('leaderboard.title') }}
    </NuxtLink>
    <div class="flex items-center justify-between gap-3 flex-wrap mt-3 mb-1">
      <div class="flex items-center gap-3 min-w-0">
        <UserAvatar :image="data.user.image" size="large" />
        <h1 class="text-2xl font-bold truncate">{{ data.user.name }}</h1>
        <span v-if="data.champion?.teamCode && flagUrl(data.champion.teamCode)" v-tooltip.top="`${t('champion.tag')}: ${data.champion.teamName}`" class="relative shrink-0 inline-flex items-center gap-1.5">
          <img :src="flagUrl(data.champion.teamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
          <span class="absolute -top-2.5 -left-2 text-sm" style="transform: rotate(-25deg)">👑</span>
          <span v-if="data.champion.awardedPoints" class="text-xs font-semibold" style="color: var(--ng-star)">+{{ data.champion.awardedPoints }} pts</span>
        </span>
        <span v-if="data.bestScorer?.teamCode && flagUrl(data.bestScorer.teamCode)" v-tooltip.top="`${t('bestScorer.tag')}: ${formatPlayerName(data.bestScorer.playerName)}`" class="relative shrink-0 inline-flex items-center gap-1.5">
          <img :src="flagUrl(data.bestScorer.teamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
          <span class="absolute -top-2.5 -left-2 text-sm" style="transform: rotate(-12deg)">👟</span>
          <span v-if="data.bestScorer.awardedPoints" class="text-xs font-semibold" style="color: var(--ng-star)">+{{ data.bestScorer.awardedPoints }} pts</span>
        </span>
        <CompetitionPill v-if="!global" />
      </div>
      <SelectButton v-model="global" :options="scopeOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
    </div>
    <p class="text-sm mb-5" style="color: var(--p-text-muted-color)">{{ t('predictions.publicNote') }}</p>
    <template v-if="data.adminView && upcoming.length">
      <PredictionList :predictions="kickedOff" />
      <div class="flex items-center gap-3 my-4 text-xs font-semibold" style="color: var(--p-text-muted-color)">
        <span class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />
        <span class="inline-flex items-center gap-1.5"><i class="pi pi-eye-slash" />{{ t('predictions.adminUpcomingDivider') }}</span>
        <span class="flex-1 border-t" style="border-color: var(--p-content-border-color)" />
      </div>
      <PredictionList :predictions="upcoming" />
    </template>
    <PredictionList v-else :predictions="data.predictions" />
    <div v-if="!data.predictions.length" class="opacity-60">{{ t('predictions.none') }}</div>
  </div>
  <!-- Unknown user or a private profile the viewer doesn't share a league with. -->
  <div v-else-if="error" class="opacity-60">{{ t('err.notFound') }}</div>
</template>
