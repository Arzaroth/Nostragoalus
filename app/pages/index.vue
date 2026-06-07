<script setup lang="ts">
const { t } = useI18n()
const { session } = useAuth()
const config = useRuntimeConfig()
const last = useLastCompetition()
const { data: competitions } = useCompetitions()

const authed = computed(() => !!(session && session.data))
const matchesLink = computed(() => `/${last.value}/matches`)

const features = [
  { icon: 'pi pi-bullseye', color: '#6366f1', key: 'scoring' },
  { icon: 'pi pi-star-fill', color: '#f59e0b', key: 'joker' },
  { icon: 'pi pi-trophy', color: '#10b981', key: 'champion' },
  { icon: 'pi pi-bolt', color: '#ef4444', key: 'live' },
  { icon: 'pi pi-sitemap', color: '#8b5cf6', key: 'bracket' },
  { icon: 'pi pi-map', color: '#06b6d4', key: 'map' },
  { icon: 'pi pi-chart-bar', color: '#ec4899', key: 'stats' },
  { icon: 'pi pi-users', color: '#3b82f6', key: 'ranking' },
  { icon: 'pi pi-flag', color: '#22c55e', key: 'competitions' },
]
const tiers = [
  { pts: '3', key: 'exact' },
  { pts: '2', key: 'diff' },
  { pts: '1', key: 'outcome' },
  { pts: '0', key: 'miss' },
]

// Banner intro: scroll-scrubbed from screen-centered card (page dimmed) to the
// docked full-bleed strip. The wrapper reserves SCRUB px of scroll for the move.
const SCRUB = 420
const bannerP = ref(0) // 0 = centered intro, 1 = docked
function onBannerScroll() {
  bannerP.value = Math.min(1, Math.max(0, window.scrollY / SCRUB))
}
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    bannerP.value = 1
    return
  }
  onBannerScroll()
  window.addEventListener('scroll', onBannerScroll, { passive: true })
})
onBeforeUnmount(() => window.removeEventListener('scroll', onBannerScroll))

const bannerT = computed(() => 1 - bannerP.value)
const bannerStyle = computed(() => {
  const t = bannerT.value
  const w = 100 - 12 * t // 88vw centered → 100vw docked
  return {
    width: `${w.toFixed(2)}vw`,
    height: `min(${(w * 0.3023).toFixed(2)}vw, 40vh)`,
    transform: `translateY(calc(${t.toFixed(4)} * (50vh - 50% - 88px)))`,
    borderRadius: `${(30 * t).toFixed(1)}px`,
    boxShadow: `0 30px 90px rgba(8, 6, 24, ${(0.55 * t).toFixed(3)})`,
    background: "url('/brand/banner-wide.svg') center / cover no-repeat",
  }
})
</script>

<template>
  <div class="flex flex-col gap-20 sm:gap-28 pb-12">
    <!-- Banner intro: sticky while the first SCRUB px of scroll animate it from
         screen-centered (page dimmed behind) to the docked full-bleed strip. -->
    <div class="relative left-1/2 -translate-x-1/2 w-screen -mt-6 -mb-8 sm:-mb-12" :style="{ height: `calc(min(30.2vw, 40vh) + ${SCRUB}px)` }">
      <div class="sticky top-16 z-40 flex justify-center">
        <div
          class="overflow-hidden"
          :style="bannerStyle"
          role="img"
          aria-label="Nostragoalus — the football oracle"
        />
      </div>
    </div>
    <div v-if="bannerT > 0.01" class="fixed inset-0 z-30 pointer-events-none" :style="{ background: '#0b0a18', opacity: (0.6 * bannerT).toFixed(3) }" />

    <!-- Hero -->
    <section class="text-center flex flex-col items-center gap-6">
      <div
        class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
        style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
      >
        <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: #22c55e" /> {{ t('landing.badge') }}
      </div>
      <h1 class="text-4xl sm:text-6xl font-extrabold max-w-3xl leading-[1.1]">
        {{ t('landing.heroA') }}
        <span class="bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">{{ t('landing.heroB') }}</span>
      </h1>
      <p class="text-lg max-w-xl" style="color: var(--p-text-muted-color)">{{ t('landing.sub') }}</p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <NuxtLink :to="authed ? matchesLink : '/signup'">
          <Button :label="authed ? t('home.goToMatches') : t('home.getStarted')" icon="pi pi-arrow-right" icon-pos="right" size="large" />
        </NuxtLink>
        <NuxtLink :to="authed ? matchesLink : '/login'">
          <Button :label="authed ? t('landing.browse') : t('nav.signIn')" size="large" severity="secondary" outlined />
        </NuxtLink>
      </div>
    </section>

    <!-- Features -->
    <section class="flex flex-col gap-10">
      <div class="text-center flex flex-col gap-3">
        <h2 class="text-3xl font-bold">{{ t('landing.featuresTitle') }}</h2>
        <p class="max-w-xl mx-auto" style="color: var(--p-text-muted-color)">{{ t('landing.featuresSub') }}</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="f in features" :key="f.key" class="ng-card rounded-2xl border p-6 flex flex-col gap-3" style="background: var(--p-content-background)">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center text-lg" :style="`background: color-mix(in srgb, ${f.color} 16%, transparent); color: ${f.color}`">
            <i :class="f.icon" />
          </div>
          <h3 class="font-bold">{{ t(`landing.f.${f.key}.t`) }}</h3>
          <p class="text-sm leading-relaxed" style="color: var(--p-text-muted-color)">{{ t(`landing.f.${f.key}.d`) }}</p>
        </div>
      </div>
    </section>

    <!-- Scoring -->
    <section
      class="rounded-3xl border p-8 sm:p-12 flex flex-col gap-8"
      style="border-color: var(--p-content-border-color); background: color-mix(in srgb, var(--p-primary-color) 7%, var(--p-content-background))"
    >
      <div class="text-center flex flex-col gap-2">
        <h2 class="text-3xl font-bold">{{ t('landing.scoringTitle') }}</h2>
        <p style="color: var(--p-text-muted-color)">{{ t('landing.scoringSub') }}</p>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          v-for="tier in tiers"
          :key="tier.key"
          class="rounded-2xl border p-5 text-center"
          style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        >
          <div class="text-4xl font-extrabold tabular-nums" style="color: var(--p-primary-color)">{{ tier.pts }}</div>
          <div class="text-sm font-medium mt-1">{{ t(`landing.tier.${tier.key}`) }}</div>
        </div>
      </div>
      <div class="flex flex-wrap justify-center gap-3 text-sm">
        <span class="rounded-full border px-3 py-1.5" style="border-color: var(--p-content-border-color); background: var(--p-content-background)">✨ {{ t('landing.bonus') }}</span>
        <span class="rounded-full border px-3 py-1.5" style="border-color: var(--p-content-border-color); background: var(--p-content-background)">★ {{ t('landing.jokerPill') }}</span>
        <span class="rounded-full border px-3 py-1.5" style="border-color: var(--p-content-border-color); background: var(--p-content-background)">🏆 {{ t('landing.championPill') }}</span>
      </div>
    </section>

    <!-- Competitions -->
    <section v-if="competitions && competitions.length" class="flex flex-col gap-8">
      <div class="text-center flex flex-col gap-2">
        <h2 class="text-3xl font-bold">{{ t('landing.compsTitle') }}</h2>
        <p style="color: var(--p-text-muted-color)">{{ t('landing.compsSub') }}</p>
      </div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NuxtLink
          v-for="c in competitions"
          :key="c.slug"
          :to="`/${c.slug}/matches`"
          class="ng-card rounded-2xl border p-5 flex items-center gap-3 transition hover:border-[var(--p-primary-color)]"
          style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        >
          <span class="text-2xl">🏆</span>
          <div class="min-w-0">
            <div class="font-bold truncate">{{ c.name }}</div>
            <div class="text-xs" style="color: var(--p-text-muted-color)">{{ t('landing.viewComp') }}</div>
          </div>
          <i class="pi pi-arrow-right ml-auto shrink-0" style="color: var(--p-primary-color)" />
        </NuxtLink>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="rounded-3xl p-10 sm:p-16 text-center text-white flex flex-col items-center gap-5" style="background: linear-gradient(135deg, #4f46e5, #10b981)">
      <img src="/brand/mark.svg" alt="" class="w-20" >
      <h2 class="text-3xl sm:text-4xl font-extrabold">{{ t('landing.ctaTitle') }}</h2>
      <p class="max-w-md text-white/90">{{ t('landing.ctaSub') }}</p>
      <NuxtLink :to="authed ? matchesLink : '/signup'">
        <Button :label="authed ? t('home.goToMatches') : t('home.getStarted')" icon="pi pi-arrow-right" icon-pos="right" size="large" severity="contrast" />
      </NuxtLink>
    </section>

    <footer class="text-center text-sm" style="color: var(--p-text-muted-color)">
      {{ config.public.appName }} · {{ t('landing.footer') }}
    </footer>
  </div>
</template>
