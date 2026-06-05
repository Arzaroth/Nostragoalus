<script setup lang="ts">
const { t } = useI18n()
const { data: predictions, isLoading } = useMyPredictions()
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-5">{{ t('nav.myPicks') }}</h1>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!predictions || !predictions.length" class="opacity-60">{{ t('predictions.empty') }}</div>
    <PredictionList v-else :predictions="predictions" />
  </div>
</template>
