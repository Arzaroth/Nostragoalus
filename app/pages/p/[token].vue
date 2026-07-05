<script setup lang="ts">
interface ProfileSummary {
  card: {
    displayName: string
    competitionName: string
    rank: number | null
    players: number
    totalPoints: number
    exact: number
    trophies: number
    badges: number
  }
}

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const token = computed(() => String(route.params.token))

const { data, error } = await useFetch<ProfileSummary>(() => `/api/share/profile/${token.value}`)

// Resolve the origin once at setup (useRequestURL needs the Nuxt instance, so it
// can't be called lazily inside the useSeoMeta getters). The card image stays a
// PNG so the LINK unfurls with a profile preview in chats.
const origin = useRequestURL().origin
const imageUrl = computed(() => `${origin}/og/profile/${token.value}`)
const pageUrl = computed(() => `${origin}/p/${token.value}`)

const card = computed(() => data.value?.card ?? null)
const title = computed(() =>
  card.value ? t('share.profileLanding.title', { name: card.value.displayName }) : 'Nostragoalus',
)
const description = computed(() => t('share.profileLanding.subtitle'))

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
      <img :src="imageUrl" :alt="title" class="w-full rounded-2xl border" style="border-color: var(--p-content-border-color)" >
      <p class="text-center" style="color: var(--p-text-muted-color)">{{ description }}</p>
      <NuxtLink to="/" class="w-full max-w-xs">
        <Button :label="t('share.landing.cta')" class="w-full" icon="pi pi-arrow-right" icon-pos="right" />
      </NuxtLink>
      <div class="flex items-center gap-2">
        <Button :label="t('share.copyLink')" icon="pi pi-link" severity="secondary" text size="small" @click="copyLink" />
      </div>
    </template>
  </div>
</template>
