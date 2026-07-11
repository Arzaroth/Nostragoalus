<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()

// Ids come from the query (?a=&b=), 'me' allowed for either. Entry is usually a
// profile's "compare with me" link; landing here bare shows the hint.
const aId = computed(() => (typeof route.query.a === 'string' ? route.query.a : null))
const bId = computed(() => (typeof route.query.b === 'string' ? route.query.b : null))
const { data, isLoading, error } = useHeadToHead(aId, bId)

useHead({ title: t('h2h.title') })
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-5 flex-wrap">
      <h1 class="text-2xl font-bold">{{ t('h2h.title') }}</h1>
      <i v-tooltip.top="t('h2h.subtitle')" class="pi pi-info-circle cursor-help text-sm" style="color: var(--p-text-muted-color)" />
      <CompetitionPill />
    </div>

    <div v-if="!aId || !bId" class="ng-card rounded-xl border border-dashed px-4 py-8 text-center" style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)" data-test="h2h-pick">
      {{ t('h2h.pickHint') }}
    </div>
    <div v-else-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="opacity-60" data-test="h2h-error">{{ t('h2h.loadError') }}</div>
    <div v-else-if="!data?.hasData" class="ng-card rounded-xl border border-dashed px-4 py-8 text-center" style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)" data-test="h2h-empty">
      {{ t('h2h.empty') }}
    </div>
    <H2HReport v-else :data="data" data-test="h2h-report" />
  </div>
</template>
