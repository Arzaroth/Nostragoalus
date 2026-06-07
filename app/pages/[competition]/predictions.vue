<script setup lang="ts">
const { t } = useI18n()
const slug = useSelectedCompetition()
const { data: predictions, isLoading } = useMyPredictions()
const { upsert, setJoker } = usePredictionMutations()

function onUpdateScore({ p, home, away }: { p: MyPrediction; home: number; away: number }) {
  upsert.mutate({ matchId: p.matchId, home, away })
}

const { data: statsData } = await useFetch<{ stats: { rank: number | null; players: number; totalPoints: number; exact: number; predictions: number; jokers: number } | null }>(
  '/api/me/stats',
  { query: computed(() => (slug.value ? { competition: slug.value } : {})) },
)
const stats = computed(() => statsData.value?.stats)

const jokerErr = ref('')
function onToggleJoker(p: MyPrediction) {
  jokerErr.value = ''
  setJoker.mutate(
    { matchId: p.matchId, isJoker: !p.isJoker },
    {
      onError: (e: any) => {
        jokerErr.value = e?.data?.message || e?.data?.statusMessage || t('predictions.jokerError')
      },
    },
  )
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <h1 class="text-2xl font-bold">{{ t('nav.myPicks') }}</h1>
      <CompetitionPill />
    </div>
    <div v-if="stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <div class="ng-card rounded-2xl border p-4 text-center" style="background: var(--p-content-background)">
        <div class="text-2xl font-extrabold tabular-nums" style="color: var(--p-primary-color)">{{ stats.totalPoints }}</div>
        <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ t('picks.points') }}</div>
      </div>
      <div class="ng-card rounded-2xl border p-4 text-center" style="background: var(--p-content-background)">
        <div class="text-2xl font-extrabold tabular-nums">{{ stats.rank ? `#${stats.rank}` : '-' }}</div>
        <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ t('picks.rank', { n: stats.players }) }}</div>
      </div>
      <div class="ng-card rounded-2xl border p-4 text-center" style="background: var(--p-content-background)">
        <div class="text-2xl font-extrabold tabular-nums">{{ stats.exact }}</div>
        <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ t('picks.exact') }}</div>
      </div>
      <div class="ng-card rounded-2xl border p-4 text-center" style="background: var(--p-content-background)">
        <div class="text-2xl font-extrabold tabular-nums">{{ stats.jokers }}</div>
        <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ t('picks.jokers', { n: stats.predictions }) }}</div>
      </div>
    </div>

    <Message v-if="jokerErr" severity="warn" class="mb-4">{{ jokerErr }}</Message>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!predictions || !predictions.length" class="opacity-60">{{ t('predictions.empty') }}</div>
    <PredictionList v-else :predictions="predictions" editable @toggle-joker="onToggleJoker" @update-score="onUpdateScore" />
  </div>
</template>
