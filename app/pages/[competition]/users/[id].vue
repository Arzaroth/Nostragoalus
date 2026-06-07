<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const slug = useSelectedCompetition()
const { data } = await useFetch<{ user: { id: string; name: string; image: string | null }; predictions: MyPrediction[] }>(
  `/api/users/${route.params.id}/predictions`,
  { query: computed(() => (slug.value ? { competition: slug.value } : {})) },
)
</script>

<template>
  <div v-if="data">
    <NuxtLink :to="`/${slug}/leaderboard`" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
      <i class="pi pi-arrow-left" /> {{ t('leaderboard.title') }}
    </NuxtLink>
    <div class="flex items-center gap-3 mt-3 mb-1">
      <Avatar :image="data.user.image || '/brand/avatar.svg'" shape="circle" size="large" class="overflow-hidden shrink-0" />
      <h1 class="text-2xl font-bold">{{ data.user.name }}</h1>
    </div>
    <p class="text-sm mb-5" style="color: var(--p-text-muted-color)">{{ t('predictions.publicNote') }}</p>
    <PredictionList :predictions="data.predictions" />
    <div v-if="!data.predictions.length" class="opacity-60">{{ t('predictions.none') }}</div>
  </div>
</template>
