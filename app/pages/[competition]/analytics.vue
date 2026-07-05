<script setup lang="ts">
const { t, locale } = useI18n()
const toast = useToast()
const slug = useSelectedCompetition()
useHead({ title: t('analytics.title') })
const { session } = useAuth()
const signedIn = computed(() => !!session.value?.data?.user?.id)
const { data, isLoading, error } = useAnalytics(signedIn)

// Mint a signed link to your own analytics card and copy it. The token names
// only you and the /a/ landing renders without a login, so it unfurls when sent
// to friends. Only offered once there is a report to share.
const sharing = ref(false)
async function shareAnalytics() {
  sharing.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/share/analytics-mint', {
      method: 'POST',
      body: { competition: slug.value ?? undefined, locale: locale.value },
    })
    if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(res.url)
    toast.add({ severity: 'success', summary: t('share.copied'), life: 2500 })
  } catch {
    toast.add({ severity: 'error', summary: t('share.failed'), life: 2500 })
  } finally {
    sharing.value = false
  }
}
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
      <Button
        v-if="signedIn && data?.hasData"
        class="ms-auto"
        size="small"
        outlined
        icon="pi pi-share-alt"
        :label="t('share.shareAnalytics')"
        :loading="sharing"
        data-test="share-analytics"
        @click="shareAnalytics"
      />
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
