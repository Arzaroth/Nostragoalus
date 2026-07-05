<script setup lang="ts">
const { t } = useI18n()
useHead({ title: t('analytics.title') })
const { session } = useAuth()
const signedIn = computed(() => !!session.value?.data?.user?.id)
const { data, isLoading, error } = useAnalytics(signedIn)
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-5 flex-wrap">
      <h1 class="text-2xl font-bold">{{ t('analytics.title') }}</h1>
      <i
        v-tooltip.top="t('analytics.subtitle')"
        class="pi pi-info-circle cursor-help text-sm"
        style="color: var(--p-text-muted-color)"
      />
      <CompetitionPill />
    </div>

    <div v-if="!signedIn" class="opacity-60">{{ t('analytics.signInHint') }}</div>
    <div v-else-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="opacity-60">{{ t('analytics.loadError') }}</div>
    <div
      v-else-if="!data?.hasData"
      class="ng-card rounded-xl border border-dashed px-4 py-8 text-center"
      style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
      data-test="analytics-empty"
    >
      {{ t('analytics.empty') }}
    </div>
    <AnalyticsReport v-else :data="data" data-test="analytics-report" />
  </div>
</template>
