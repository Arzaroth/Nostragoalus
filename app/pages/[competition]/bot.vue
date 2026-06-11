<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const slug = useSelectedCompetition()
const botMethod = useBotMethod()
// Carried over from a league-scoped leaderboard: same consensus lens here.
const leagueId = computed(() => (route.query.league ? String(route.query.league) : null))
const { data, isLoading } = useBotPredictions(botMethod, leagueId)

const methodOptions = computed(() => [
  { label: t('bot.methodMode'), value: 'mode' },
  { label: t('bot.methodMean'), value: 'mean' },
])
// The server enforces the population gate; mirror it in the control.
watchEffect(() => {
  if (data.value && !data.value.modeAvailable && botMethod.value === 'mode') botMethod.value = 'mean'
})
</script>

<template>
  <div>
    <NuxtLink :to="`/${slug}/leaderboard`" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
      <i class="pi pi-arrow-left" /> {{ t('leaderboard.title') }}
    </NuxtLink>
    <div v-if="isLoading" class="opacity-60 mt-3">{{ t('common.loading') }}</div>
    <div v-else-if="data">
      <div class="flex items-center justify-between gap-3 flex-wrap mt-3 mb-1">
        <div class="flex items-center gap-3 min-w-0">
          <span class="text-4xl leading-none shrink-0">🤖</span>
          <h1 class="text-2xl font-bold truncate">{{ t('bot.name') }}</h1>
          <span class="text-xs font-normal px-1.5 py-0.5 rounded-full shrink-0" style="color: var(--p-text-muted-color); background: var(--p-content-border-color)">{{ t('bot.virtual') }}</span>
          <span
            v-if="data.champion?.teamCode && flagUrl(data.champion.teamCode)"
            class="relative shrink-0 inline-flex items-center gap-1.5"
            v-tooltip.top="`${t('champion.title')}: ${data.champion.teamName} (${t('bot.pickedBy', { count: data.champion.count, total: data.champion.total })})`"
          >
            <img :src="flagUrl(data.champion.teamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
            <span class="absolute -top-2.5 -left-2 text-sm" style="transform: rotate(-25deg)">👑</span>
            <span v-if="data.champion.awardedPoints" class="text-xs font-semibold" style="color: var(--ng-star)">+{{ data.champion.awardedPoints }} pts</span>
          </span>
          <CompetitionPill />
          <span v-if="data.league" class="text-xs font-semibold px-2 py-1 rounded-full truncate min-w-0 max-w-[45vw] sm:max-w-none" style="color: var(--p-primary-color); background: var(--p-highlight-background, var(--p-content-border-color))">{{ data.league.name }}</span>
        </div>
        <SelectButton v-if="data.modeAvailable" v-model="botMethod" :options="methodOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
      </div>
      <p class="text-sm mb-2" style="color: var(--p-text-muted-color)">
        {{ t('bot.note') }}
        <span v-if="!data.modeAvailable" v-tooltip.top="t('bot.modeDisabled')" class="cursor-help"><i class="pi pi-info-circle" /></span>
      </p>
      <div class="flex items-center gap-2 flex-wrap text-sm mb-3" style="color: var(--p-text-muted-color)">
        <span v-if="data.summary.rank" class="font-semibold" style="color: var(--p-text-color)">#{{ data.summary.rank }}</span>
        <span class="font-semibold" style="color: var(--p-text-color)">{{ data.summary.totalPoints }} {{ t('leaderboard.pts') }}</span>
        <span>· {{ data.summary.exactCount }} {{ t('leaderboard.exact') }}</span>
        <span>· {{ data.summary.outcomeCount }} {{ t('leaderboard.correct') }}</span>
        <span v-if="data.summary.championPoints">· 👑 +{{ data.summary.championPoints }}</span>
      </div>
      <Message v-if="data.admin" severity="info" size="small" class="mb-4">{{ t('bot.adminUpcoming') }}</Message>
      <PredictionList :predictions="data.predictions" />
      <div v-if="!data.predictions.length" class="opacity-60">{{ t('bot.empty') }}</div>
    </div>
  </div>
</template>
