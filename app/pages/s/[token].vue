<script setup lang="ts">
interface ShareSummary {
  card: {
    state: 'result' | 'live' | 'reveal' | 'sealed'
    ownerName: string
    homeTeam: string
    awayTeam: string
    predHome: number | null
    predAway: number | null
    competitionName: string
  }
  matchId: string
  competitionSlug: string
}

const { t } = useI18n()
const route = useRoute()
const token = computed(() => String(route.params.token))

const { data, error } = await useFetch<ShareSummary>(() => `/api/share/${token.value}`)

// Resolve the origin once at setup (useRequestURL needs the Nuxt instance, so it
// can't be called lazily inside the useSeoMeta getters). Absolute URL is what
// social crawlers need to unfurl the card.
const origin = useRequestURL().origin
const imageUrl = computed(() => `${origin}/og/share/${token.value}`)
const matchLink = computed(() => (data.value ? `/${data.value.competitionSlug}/matches/${data.value.matchId}` : '/'))

const card = computed(() => data.value?.card ?? null)
const score = computed(() => (card.value && card.value.predHome != null ? `${card.value.predHome}-${card.value.predAway}` : ''))
const title = computed(() => {
  const c = card.value
  if (!c) return 'Nostragoalus'
  switch (c.state) {
    case 'result':
      return t('share.landing.resultTitle', { name: c.ownerName, score: score.value })
    case 'live':
      return t('share.landing.liveTitle', { name: c.ownerName, score: score.value })
    case 'reveal':
      return t('share.landing.revealTitle', { name: c.ownerName, score: score.value })
    case 'sealed':
      return t('share.landing.sealedTitle', { name: c.ownerName })
  }
})
const description = computed(() => t('share.landing.subtitle'))

useSeoMeta({
  title: () => title.value,
  description: () => description.value,
  ogTitle: () => title.value,
  ogDescription: () => description.value,
  ogImage: () => imageUrl.value,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageAlt: () => title.value,
  twitterCard: 'summary_large_image',
  twitterTitle: () => title.value,
  twitterDescription: () => description.value,
  twitterImage: () => imageUrl.value,
})
</script>

<template>
  <div class="max-w-2xl mx-auto mt-12 flex flex-col items-center gap-6 text-center px-4">
    <NuxtLink to="/" class="flex items-center gap-2">
      <img src="/brand/mark.svg" alt="Nostragoalus" class="w-10" >
      <span class="text-lg font-bold">Nostragoalus</span>
    </NuxtLink>

    <div v-if="error || !card" class="ng-card rounded-2xl border p-6 w-full" style="background: var(--p-content-background)">
      <i class="pi pi-times-circle text-3xl" style="color: var(--ng-danger)" />
      <p class="mt-3 font-medium">{{ t('share.failed') }}</p>
      <NuxtLink to="/" class="text-sm inline-block mt-4" style="color: var(--p-primary-color)">{{ t('share.landing.cta') }}</NuxtLink>
    </div>

    <template v-else>
      <h1 class="text-2xl font-bold">{{ title }}</h1>
      <img
        :src="imageUrl"
        :alt="title"
        class="w-full rounded-2xl border shadow-lg"
        style="aspect-ratio: 1200 / 630; background: var(--p-content-background)"
        width="1200"
        height="630"
      >
      <p style="color: var(--p-text-muted-color)">{{ description }}</p>
      <NuxtLink :to="matchLink" class="w-full max-w-xs">
        <Button :label="t('share.landing.cta')" class="w-full" icon="pi pi-arrow-right" icon-pos="right" />
      </NuxtLink>
    </template>
  </div>
</template>
