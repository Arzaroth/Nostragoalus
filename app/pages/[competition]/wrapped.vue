<script setup lang="ts">
const { t, locale } = useI18n()
useHead({ title: t('wrapped.title') })
const router = useRouter()
const slug = useSelectedCompetition()

const { data, isLoading, error } = useWrapped()
const ready = computed(() => data.value?.ready === true)

function close() {
  void router.push(`/${slug.value ?? ''}`)
}

// The share card is minted lazily on the summary slide's buttons: a signed
// token names only the caller, the OG route renders the PNG.
const shareState = ref<'idle' | 'busy' | 'copied' | 'error'>('idle')
async function mintImageUrl(): Promise<string> {
  const res = await $fetch<{ imageUrl: string }>('/api/share/wrapped-mint', {
    method: 'POST',
    body: { competition: slug.value ?? undefined, locale: locale.value },
  })
  return res.imageUrl
}
async function downloadCard() {
  shareState.value = 'busy'
  try {
    const url = await mintImageUrl()
    const blob = await $fetch<Blob>(url, { responseType: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'tournament-wrapped.png'
    a.click()
    URL.revokeObjectURL(a.href)
    shareState.value = 'idle'
  } catch {
    shareState.value = 'error'
  }
}
async function copyCardLink() {
  shareState.value = 'busy'
  try {
    const url = await mintImageUrl()
    await navigator.clipboard.writeText(url)
    shareState.value = 'copied'
  } catch {
    shareState.value = 'error'
  }
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

    <WrappedDeck v-else-if="data && data.ready" :wrapped="data" @close="close">
      <template #summary-actions>
        <div class="flex flex-col items-center gap-2 mt-2">
          <div class="flex gap-2">
            <Button size="small" icon="pi pi-download" :label="t('wrapped.shareDownload')" :loading="shareState === 'busy'" data-test="wrapped-download" @click="downloadCard" />
            <Button size="small" severity="secondary" icon="pi pi-link" :label="t('wrapped.shareCopy')" :loading="shareState === 'busy'" data-test="wrapped-copy" @click="copyCardLink" />
          </div>
          <span v-if="shareState === 'copied'" class="text-sm opacity-90">{{ t('wrapped.shareCopied') }}</span>
          <span v-else-if="shareState === 'error'" class="text-sm opacity-90">{{ t('wrapped.shareError') }}</span>
        </div>
      </template>
    </WrappedDeck>
  </div>
</template>
