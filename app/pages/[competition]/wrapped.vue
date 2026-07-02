<script setup lang="ts">
const { t } = useI18n()
useHead({ title: t('wrapped.title') })
const router = useRouter()
const slug = useSelectedCompetition()

const { data, isLoading, error } = useWrapped()
const ready = computed(() => data.value?.ready === true)

function close() {
  void router.push(`/${slug.value ?? ''}`)
}
</script>

<template>
  <div class="min-h-[60vh] flex items-center justify-center">
    <div v-if="isLoading" class="flex flex-col items-center gap-3 py-16">
      <i class="pi pi-spinner pi-spin text-3xl" />
      <p style="color: var(--p-text-muted-color)">{{ t('common.loading') }}</p>
    </div>

    <Message v-else-if="error" severity="error" class="my-8">{{ t('wrapped.loadError') }}</Message>

    <!-- Pre-final teaser: the recap is a reveal, not an error state. -->
    <div v-else-if="data && !ready" class="flex flex-col items-center gap-4 py-16 text-center px-4" data-test="wrapped-teaser">
      <div class="text-6xl">🎁</div>
      <h1 class="text-2xl font-extrabold">{{ t('wrapped.teaserTitle') }}</h1>
      <p class="max-w-md" style="color: var(--p-text-muted-color)">
        {{ t('wrapped.teaserBody', { competition: data.competitionName }) }}
      </p>
    </div>

    <WrappedDeck v-else-if="data && data.ready" :wrapped="data" @close="close" />
  </div>
</template>
