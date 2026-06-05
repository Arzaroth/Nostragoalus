<script setup lang="ts">
const { t } = useI18n()
const { data: predictions, isLoading } = useMyPredictions()
const { setJoker } = usePredictionMutations()

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
    <h1 class="text-2xl font-bold mb-5">{{ t('nav.myPicks') }}</h1>
    <Message v-if="jokerErr" severity="warn" class="mb-4">{{ jokerErr }}</Message>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!predictions || !predictions.length" class="opacity-60">{{ t('predictions.empty') }}</div>
    <PredictionList v-else :predictions="predictions" editable @toggle-joker="onToggleJoker" />
  </div>
</template>
