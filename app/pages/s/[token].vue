<script setup lang="ts">
interface ShareSummary {
  card: {
    state: 'result' | 'live' | 'reveal' | 'sealed'
    ownerName: string
    competitionName: string
    roundLabel: string
    group: string | null
    homeTeam: string
    awayTeam: string
    homeTeamCode: string | null
    awayTeamCode: string | null
    predHome: number | null
    predAway: number | null
    actualHome: number | null
    actualAway: number | null
    pensHome: number | null
    pensAway: number | null
    tier: string | null
    totalPoints: number | null
    isJoker: boolean
    crowdSharePct: number | null
  }
  matchId: string
  competitionSlug: string
}

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const token = computed(() => String(route.params.token))

const { data, error } = await useFetch<ShareSummary>(() => `/api/share/${token.value}`)

// Resolve the origin once at setup (useRequestURL needs the Nuxt instance, so it
// can't be called lazily inside the useSeoMeta getters). The OG image stays a
// PNG so the LINK unfurls with a per-pick preview in chats; the page itself
// renders the live HTML card below.
const origin = useRequestURL().origin
const imageUrl = computed(() => `${origin}/og/share/${token.value}`)
const pageUrl = computed(() => `${origin}/s/${token.value}`)
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

async function copyLink() {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(pageUrl.value)
    toast.add({ severity: 'success', summary: t('share.copied'), life: 2500 })
  }
}

async function downloadImage() {
  const blob = await (await fetch(imageUrl.value)).blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = 'nostragoalus-pick.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}
</script>

<template>
  <div class="max-w-2xl mx-auto mt-12 flex flex-col items-center gap-6 px-4">
    <NuxtLink to="/" class="flex items-center gap-2">
      <img src="/brand/mark.svg" alt="Nostragoalus" class="w-10" >
      <span class="text-lg font-bold">Nostragoalus</span>
    </NuxtLink>

    <div v-if="error || !card" class="ng-card rounded-2xl border p-6 w-full text-center" style="background: var(--p-content-background)">
      <i class="pi pi-times-circle text-3xl" style="color: var(--ng-danger)" />
      <p class="mt-3 font-medium">{{ t('share.failed') }}</p>
      <NuxtLink to="/" class="text-sm inline-block mt-4" style="color: var(--p-primary-color)">{{ t('share.landing.cta') }}</NuxtLink>
    </div>

    <template v-else>
      <h1 class="text-2xl font-bold text-center">{{ title }}</h1>
      <ShareCardView :card="card" :competition-slug="data?.competitionSlug" class="w-full" />
      <p class="text-center" style="color: var(--p-text-muted-color)">{{ description }}</p>
      <NuxtLink :to="matchLink" class="w-full max-w-xs">
        <Button :label="t('share.landing.cta')" class="w-full" icon="pi pi-arrow-right" icon-pos="right" />
      </NuxtLink>
      <div class="flex items-center gap-2">
        <Button :label="t('share.copyLink')" icon="pi pi-link" severity="secondary" text size="small" @click="copyLink" />
        <Button :label="t('share.download')" icon="pi pi-download" severity="secondary" text size="small" @click="downloadImage" />
      </div>
    </template>
  </div>
</template>
